/**
 * TestNotificationButton.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * "Test Bildirimi Gönder" butonu.
 *
 * Akış:
 *  1. Supabase'deki send-test-notification Edge Function'ını çağırır.
 *  2. Edge Function user_fcm_tokens tablosundan token çekip FCM'ye gönderir.
 *  3. Başarı/hata toast'u gösterir ve console'a detaylı log basar.
 *
 * Bu bileşen yalnızca geliştirme/debug amaçlıdır.
 * Bildirim testi başarılı olduğunda prod'da kaldırabilirsiniz.
 */

import { useState } from 'react';
import { Send, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

// ─── Toast Tipi ──────────────────────────────────────────────────────────────

type ToastState =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; message: string }
  | { type: 'error';   message: string };

// ─── Bileşen ─────────────────────────────────────────────────────────────────

export function TestNotificationButton() {
  const [toast, setToast] = useState<ToastState>({ type: 'idle' });

  const handleTest = async () => {
    setToast({ type: 'loading' });

    // ── En dış try-catch: ağ, CORS veya JS hatalarını yakalar ─────────────
    try {
      // ── 0. Ortam değişkenini doğrula ──────────────────────────────────────
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;

      if (!supabaseUrl) {
        const msg = 'VITE_SUPABASE_URL tanımlı değil! .env dosyasını kontrol et.';
        console.error('[TestNotif] ❌', msg);
        setToast({ type: 'error', message: msg });
        return;
      }

      // ── 1. Oturum token'ını al ─────────────────────────────────────────────
      console.log('[TestNotif] Oturum alınıyor...');
      let accessToken: string;

      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !sessionData.session) {
          const msg = `Oturum bilgisi alınamadı: ${sessionError?.message ?? 'Session null'}`;
          console.error('[TestNotif] ❌', msg);
          setToast({ type: 'error', message: msg });
          return;
        }

        accessToken = sessionData.session.access_token;
        console.log('[TestNotif] ✅ Oturum doğrulandı.');
      } catch (sessionErr) {
        const msg = `Oturum alma hatası: ${sessionErr instanceof Error ? sessionErr.message : JSON.stringify(sessionErr)}`;
        console.error('[TestNotif] ❌', msg, sessionErr);
        setToast({ type: 'error', message: msg });
        return;
      }

      // ── 2. Edge Function isteğini at ───────────────────────────────────────
      const fnUrl = `${supabaseUrl}/functions/v1/send-test-notification`;
      console.log('[TestNotif] Edge Function isteği atılıyor...', { url: fnUrl });

      let res: Response;
      try {
        res = await fetch(fnUrl, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
        });
      } catch (fetchErr) {
        // Ağ hatası veya CORS engeli — Response hiç gelmedi
        const msg = `Ağ/CORS hatası — sunucuya ulaşılamadı: ${fetchErr instanceof Error ? fetchErr.message : JSON.stringify(fetchErr)}`;
        console.error('[TestNotif] ❌ fetch() başarısız:', fetchErr);
        setToast({ type: 'error', message: msg });
        return;
      }

      console.log('[TestNotif] HTTP yanıt alındı. Status:', res.status);

      // ── 3. Yanıt gövdesini ayrıştır ───────────────────────────────────────
      let data: {
        success?:  boolean;
        sent?:     number;
        failed?:   number;
        total?:    number;
        results?:  Array<{ device: string; ok: boolean; status: number; body: string }>;
        error?:    string;
        hint?:     string;
      };

      try {
        data = await res.json();
      } catch (jsonErr) {
        const rawText = await res.text().catch(() => '(gövde okunamadı)');
        const msg = `Yanıt JSON parse hatası (HTTP ${res.status}): ${rawText.slice(0, 200)}`;
        console.error('[TestNotif] ❌', msg, jsonErr);
        setToast({ type: 'error', message: msg });
        return;
      }

      console.log('[TestNotif] Edge Function yanıtı:', data);

      // ── 4. Yanıtı değerlendir ──────────────────────────────────────────────
      if (!res.ok || data.error) {
        const errDetail = data.hint
          ? `${data.error} (İpucu: ${data.hint})`
          : (data.error ?? `HTTP ${res.status}`);
        console.error('[TestNotif] ❌ Hata:', errDetail, '\nTam yanıt:', data);
        setToast({ type: 'error', message: errDetail });
        return;
      }

      // Kısmi başarı
      if (data.sent === 0 && (data.total ?? 0) > 0) {
        const failDetails = data.results
          ?.filter(r => !r.ok)
          .map(r => `${r.device}: HTTP ${r.status} — ${r.body}`)
          .join('\n') ?? '';
        const msg = `${data.total} token var ama hiçbirine gönderilemedi.\n${failDetails}`;
        console.error('[TestNotif] ❌ Gönderim başarısız:\n', failDetails);
        setToast({ type: 'error', message: msg });
        return;
      }

      // Başarılı
      const successMsg = `✅ Test bildirimi ${data.sent}/${data.total} cihaza gönderildi!`;
      console.log('[TestNotif]', successMsg, data.results);
      setToast({ type: 'success', message: successMsg });

      // 5 saniye sonra sıfırla
      setTimeout(() => setToast({ type: 'idle' }), 5000);

    } catch (err) {
      // Catch edilemeyen son savunma hattı
      const msg = err instanceof Error
        ? `${err.name}: ${err.message}`
        : JSON.stringify(err);
      console.error('[TestNotif] ❌ Yakalanmamış hata:', err);
      setToast({ type: 'error', message: `Beklenmeyen hata: ${msg}` });
    }
  };

  // ── Renk / ikon konfigürasyonu ─────────────────────────────────────────────
  const isLoading = toast.type === 'loading';

  return (
    <div className="mx-4 mb-3 select-none">
      {/* Buton */}
      <button
        id="test-notification-btn"
        onClick={() => void handleTest()}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-2xl text-sm font-bold transition-all duration-200 active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          background:   'linear-gradient(135deg, rgba(124,58,237,0.18), rgba(99,102,241,0.12))',
          border:       '1px dashed rgba(124,58,237,0.45)',
          color:        '#a78bfa',
        }}
        aria-label="Test bildirimi gönder"
      >
        {isLoading ? (
          <>
            <Loader2 size={15} className="animate-spin text-violet-400" />
            <span>Gönderiliyor...</span>
          </>
        ) : (
          <>
            <Send size={14} className="text-violet-400" />
            <span>Test Bildirimi Gönder</span>
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
              style={{ background: 'rgba(124,58,237,0.25)', color: '#c4b5fd' }}
            >
              DEBUG
            </span>
          </>
        )}
      </button>

      {/* Toast - Başarı */}
      {toast.type === 'success' && (
        <div
          className="mt-2 rounded-2xl px-4 py-3 flex items-start gap-3 animate-fade-in"
          style={{
            background: 'rgba(16,185,129,0.10)',
            border:     '1px solid rgba(16,185,129,0.25)',
          }}
        >
          <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
          <p className="text-emerald-300 text-xs leading-snug font-medium whitespace-pre-line">
            {toast.message}
          </p>
        </div>
      )}

      {/* Toast - Hata */}
      {toast.type === 'error' && (
        <div
          className="mt-2 rounded-2xl px-4 py-3 flex items-start gap-3 animate-fade-in"
          style={{
            background: 'rgba(239,68,68,0.10)',
            border:     '1px solid rgba(239,68,68,0.25)',
          }}
        >
          <XCircle size={16} className="text-rose-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-rose-300 text-xs font-bold mb-0.5">Bildirim Gönderilemedi</p>
            <p className="text-rose-400/80 text-[11px] leading-snug break-words whitespace-pre-line">
              {toast.message}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
