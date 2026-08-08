/**
 * qstash.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Upstash QStash REST API ile gecikmeli görev bildirim zamanlaması.
 *
 * Akış:
 *  1. Kullanıcı görev ekler (reminder_time ayarlanmış).
 *  2. Bu modül QStash'e "Upstash-Not-Before" (kesin Unix timestamp) ile POST eder.
 *  3. QStash, o zamana ulaştığında Supabase Edge Function'ı çağırır.
 *  4. Edge Function FCM üzerinden bildirimi gönderir.
 *
 * Ortam değişkenleri (.env):
 *   VITE_QSTASH_URL      = https://qstash.upstash.io/v2/publish/<EDGE_URL>
 *   VITE_QSTASH_TOKEN    = eyJ...  (QStash token)
 *
 * ⚠️  QStash token'ı frontend'e koymak geliştirme/demo içindir.
 *     Üretimde bu çağrıyı backend'e (Edge Function) taşıyın.
 *
 * ── Kritik Düzeltmeler ──────────────────────────────────────────────────────
 *  • Upstash-Delay → Upstash-Not-Before (kesin UTC Unix saniye)
 *    Sebebi: Delay "şu andan X saniye sonra" demek — hesaplama sapabilir.
 *    Not-Before ise "tam bu UNIX timestamp'te çalıştır" — timezone bağımsız.
 *
 *  • Upstash-Message-Id sabit string kaldırıldı.
 *    Sebebi: QStash aynı ID'yi tekrar görünce mesajı REDDEDER (deduplication).
 *    Aynı görev için ikinci bir schedule denendiğinde sessizce başarısız olur.
 *    Şimdi her zamanlama için benzersiz bir ID üretiliyor.
 */

// ─── Tipler ──────────────────────────────────────────────────────────────────

export interface ScheduleReminderParams {
  /** Supabase'deki görev ID'si */
  taskId: string;
  /** Bildirim başlığı */
  title: string;
  /** Hatırlatıcı zamanı (ISO 8601, UTC offset dahil) */
  reminderTime: string;
  /** Görev önceliği (bildirim payload'ına eklenir) */
  priority?: 'low' | 'medium' | 'high';
}

export interface ScheduleResult {
  ok: boolean;
  /** QStash tarafından atanan mesaj ID'si */
  messageId?: string;
  /** Zamanlanan kesin UTC Unix saniyesi */
  scheduledAtUnix?: number;
  error?: string;
}

// ─── QStash Zamanlayıcı ───────────────────────────────────────────────────────

/**
 * QStash'e "Not-Before" zamanlı bir iş tanımlar.
 *
 * `Upstash-Not-Before` header'ı kesin bir Unix timestamp (saniye) alır.
 * Bu yaklaşım timezone hatalarına karşı immundur: ISO stringi UTC'ye
 * çevrilir, `Date.getTime() / 1000` ile Unix saniyeye indirgenir.
 *
 * @param params  Görev ve hatırlatıcı zamanı bilgileri
 * @returns       QStash yanıtı (messageId veya hata)
 */
export async function scheduleTaskReminder(
  params: ScheduleReminderParams
): Promise<ScheduleResult> {
  const qstashUrl   = import.meta.env.VITE_QSTASH_URL   as string | undefined;
  const qstashToken = import.meta.env.VITE_QSTASH_TOKEN as string | undefined;

  // ── Env kontrolü ─────────────────────────────────────────────────────────
  if (!qstashUrl || !qstashToken) {
    console.error(
      '[qstash] ❌ VITE_QSTASH_URL veya VITE_QSTASH_TOKEN tanımlı değil. ' +
      'Zamanlama atlandı. .env dosyasını kontrol edin.'
    );
    return { ok: false, error: 'QStash yapılandırması eksik (.env).' };
  }

  // ── Zaman hesabı (UTC, timezone bağımsız) ────────────────────────────────
  //
  // new Date(isoString).getTime() → milisaniye cinsinden UTC epoch
  // ISO stringi "2026-08-08T20:30:00.000Z" veya "2026-08-08T23:30:00+03:00"
  // gibi offset içeriyorsa JavaScript bunu doğru UTC'ye çevirir.
  //
  const reminderDate   = new Date(params.reminderTime);
  const nowMs          = Date.now();
  const reminderUnixMs = reminderDate.getTime();
  const delayMs        = reminderUnixMs - nowMs;

  if (isNaN(reminderUnixMs)) {
    console.error('[qstash] ❌ Geçersiz reminderTime:', params.reminderTime);
    return { ok: false, error: 'Geçersiz tarih formatı.' };
  }

  if (delayMs <= 0) {
    console.warn(
      '[qstash] ⚠️ Hatırlatıcı zamanı geçmişte veya şu an, zamanlama atlandı.',
      { reminderTime: params.reminderTime, delayMs }
    );
    return { ok: false, error: 'Hatırlatıcı zamanı geçmişte.' };
  }

  // Unix timestamp (saniye) — QStash'in beklediği format
  const notBeforeUnixSec = Math.floor(reminderUnixMs / 1000);

  // ── Benzersiz Mesaj ID'si ─────────────────────────────────────────────────
  // ÖNEMLİ: Sabit bir ID kullanırsak QStash deduplication nedeniyle
  // aynı görev için ikinci schedule denemesini sessizce reddeder.
  // Benzersiz ID = taskId + timestamp (her schedule çağrısı yeni ID alır)
  const uniqueMessageId = `task-${params.taskId}-${notBeforeUnixSec}`;

  // ── Edge Function'a iletilecek payload ───────────────────────────────────
  const jobPayload = {
    taskId:       params.taskId,
    title:        params.title,
    priority:     params.priority ?? 'medium',
    reminderTime: params.reminderTime,
  };

  console.log(
    '[qstash] Zamanlama isteği gönderiliyor...',
    {
      url:         qstashUrl,
      taskId:      params.taskId,
      reminderISO: params.reminderTime,
      notBefore:   notBeforeUnixSec,
      delayDk:     Math.round(delayMs / 60_000),
      messageId:   uniqueMessageId,
    }
  );

  try {
    const res = await fetch(qstashUrl, {
      method: 'POST',
      headers: {
        'Authorization':       `Bearer ${qstashToken}`,
        'Content-Type':        'application/json',
        // Kesin UTC Unix saniye — timezone hatalarına karşı immune
        'Upstash-Not-Before':  String(notBeforeUnixSec),
        // Her çağrıda benzersiz ID — deduplication sorununu önler
        'Upstash-Message-Id':  uniqueMessageId,
      },
      body: JSON.stringify(jobPayload),
    });

    const responseText = await res.text();

    if (!res.ok) {
      console.error(
        `[qstash] ❌ QStash isteği başarısız! HTTP ${res.status}:`,
        responseText,
        '\nGönderilen URL:', qstashUrl,
        '\nNot-Before:', notBeforeUnixSec
      );
      return {
        ok:    false,
        error: `QStash HTTP ${res.status}: ${responseText}`,
      };
    }

    let data: { messageId?: string } = {};
    try {
      data = JSON.parse(responseText);
    } catch {
      // Bazı QStash yanıtları düz text dönebilir
      console.warn('[qstash] Yanıt JSON parse edilemedi, ham metin:', responseText);
    }

    const msgId = data.messageId ?? uniqueMessageId;
    console.log(
      `[qstash] ✅ Zamanlama başarılı!`,
      {
        messageId:     msgId,
        notBefore:     notBeforeUnixSec,
        scheduledTime: new Date(notBeforeUnixSec * 1000).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
        delayDk:       Math.round(delayMs / 60_000),
      }
    );

    return {
      ok:              true,
      messageId:       msgId,
      scheduledAtUnix: notBeforeUnixSec,
    };

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[qstash] ❌ Ağ/fetch hatası:', message, err);
    return { ok: false, error: `Ağ hatası: ${message}` };
  }
}

// ─── Görev İptal ─────────────────────────────────────────────────────────────

/**
 * Bir QStash mesajını messageId ile iptal eder.
 * Görev silindiğinde ya da hatırlatıcı kaldırıldığında çağırın.
 *
 * @param messageId  QStash messageId (scheduleTaskReminder'dan döner)
 */
export async function cancelTaskReminder(messageId: string): Promise<void> {
  const qstashToken = import.meta.env.VITE_QSTASH_TOKEN as string | undefined;
  if (!qstashToken || !messageId) return;

  console.log('[qstash] Mesaj iptal ediliyor:', messageId);

  try {
    const res = await fetch(
      `https://qstash.upstash.io/v2/messages/${messageId}`,
      {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${qstashToken}` },
      }
    );

    if (res.ok) {
      console.log(`[qstash] ✅ Mesaj iptal edildi: ${messageId}`);
    } else {
      const txt = await res.text().catch(() => '');
      console.warn(`[qstash] ⚠️ İptal başarısız (${res.status}): ${txt}`);
    }
  } catch (err) {
    console.error('[qstash] cancelTaskReminder ağ hatası:', err);
  }
}
