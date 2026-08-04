/**
 * qstash.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Upstash QStash REST API ile gecikmeli görev bildirim zamanlaması.
 *
 * Akış:
 *  1. Kullanıcı görev ekler (reminder_time ayarlanmış).
 *  2. Bu modül QStash'e bir "delayed job" POST eder.
 *  3. QStash, reminder_time'a ulaştığında Supabase Edge Function'ı çağırır.
 *  4. Edge Function, push_subscriptions tablosundan abonelikleri çekip
 *     Web Push (VAPID) ile bildirim gönderir.
 *
 * Ortam değişkenleri (.env):
 *   VITE_QSTASH_URL      = https://qstash.upstash.io/v2/publish/<EDGE_URL>
 *   VITE_QSTASH_TOKEN    = qst_...  (QStash token)
 *
 * ⚠️  QStash token'ı frontend'e koymak geliştirme/demo içindir.
 *     Üretimde bu çağrıyı backend'e (Edge Function) taşıyın.
 */

// ─── Tipler ──────────────────────────────────────────────────────────────────

export interface ScheduleReminderParams {
  /** Supabase'deki görev ID'si */
  taskId: string;
  /** Bildirim başlığı */
  title: string;
  /** Hatırlatıcı zamanı (ISO 8601) */
  reminderTime: string;
  /** Görev önceliği (bildirim payload'ına eklenir) */
  priority?: 'low' | 'medium' | 'high';
}

export interface ScheduleResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

// ─── QStash Zamanlayıcı ───────────────────────────────────────────────────────

/**
 * QStash'e gecikmeli bir iş (delayed job) tanımlar.
 * Gecikme `Upstash-Delay` header'ı ile saniye cinsinden belirlenir.
 *
 * @param params  Görev ve hatırlatıcı zamanı bilgileri
 * @returns       QStash yanıtı (messageId veya hata)
 */
export async function scheduleTaskReminder(
  params: ScheduleReminderParams
): Promise<ScheduleResult> {
  const qstashUrl   = import.meta.env.VITE_QSTASH_URL   as string | undefined;
  const qstashToken = import.meta.env.VITE_QSTASH_TOKEN as string | undefined;

  // Eksik env değişkeni kontrolü
  if (!qstashUrl || !qstashToken) {
    console.warn(
      '[qstash] VITE_QSTASH_URL veya VITE_QSTASH_TOKEN tanımlı değil. ' +
      'Zamanlama atlandı.'
    );
    return { ok: false, error: 'QStash yapılandırması eksik.' };
  }

  // Gecikmeyi hesapla (saniye cinsinden, minimum 5 saniye)
  const reminderDate = new Date(params.reminderTime);
  const now          = new Date();
  const delayMs      = reminderDate.getTime() - now.getTime();

  if (delayMs <= 0) {
    console.warn('[qstash] Hatırlatıcı zamanı geçmişte, zamanlama atlandı.');
    return { ok: false, error: 'Hatırlatıcı zamanı geçmişte.' };
  }

  // QStash maksimum gecikme: 7 gün (604800 saniye)
  const delaySeconds = Math.min(Math.round(delayMs / 1000), 604_800);

  // Edge Function'a iletilecek payload
  const jobPayload = {
    taskId:       params.taskId,
    title:        params.title,
    priority:     params.priority ?? 'medium',
    reminderTime: params.reminderTime,
  };

  try {
    const res = await fetch(qstashUrl, {
      method: 'POST',
      headers: {
        'Authorization':  `Bearer ${qstashToken}`,
        'Content-Type':   'application/json',
        'Upstash-Delay':  `${delaySeconds}s`,
        // QStash'in aynı görev için tekrar tetiklememesi için benzersiz ID
        'Upstash-Message-Id': `task-${params.taskId}`,
      },
      body: JSON.stringify(jobPayload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[qstash] QStash hatası:', res.status, errText);
      return { ok: false, error: `QStash yanıtı: ${res.status} ${errText}` };
    }

    const data = await res.json() as { messageId?: string };
    console.log(
      `[qstash] Zamanlama başarılı — messageId: ${data.messageId ?? 'N/A'}, ` +
      `gecikme: ${delaySeconds}s (${Math.round(delaySeconds / 60)} dk)`
    );

    return { ok: true, messageId: data.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[qstash] Ağ hatası:', message);
    return { ok: false, error: message };
  }
}

// ─── Görev Güncelleme / İptal ─────────────────────────────────────────────────

/**
 * Mevcut bir QStash mesajını iptal eder.
 * Görev silindiğinde ya da hatırlatıcı kaldırıldığında çağırın.
 *
 * @param messageId  QStash messageId (scheduleTaskReminder'dan döner)
 */
export async function cancelTaskReminder(messageId: string): Promise<void> {
  const qstashToken = import.meta.env.VITE_QSTASH_TOKEN as string | undefined;
  if (!qstashToken || !messageId) return;

  try {
    const res = await fetch(
      `https://qstash.upstash.io/v2/messages/${messageId}`,
      {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${qstashToken}` },
      }
    );

    if (res.ok) {
      console.log(`[qstash] Mesaj iptal edildi: ${messageId}`);
    } else {
      console.warn(`[qstash] İptal başarısız: ${res.status}`);
    }
  } catch (err) {
    console.error('[qstash] cancelTaskReminder hatası:', err);
  }
}
