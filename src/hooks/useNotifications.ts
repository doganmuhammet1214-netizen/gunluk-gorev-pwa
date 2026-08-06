/**
 * useNotifications.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Web Push bildirim abonelik yönetimi.
 *
 * Mimari:
 *  - subscribeToPush()  → pushSubscription.ts üzerinden VAPID + Supabase
 *  - iOS uyumu: subscribe() fonksiyonu SADECE kullanıcı etkileşimiyle çağrılır
 *  - SW renewal: pushsubscriptionchange mesajını dinler ve Supabase'i günceller
 *  - checkAndSaveFCMToken(): Uygulama her açıldığında / kullanıcı giriş yaptığında
 *    arka planda sessizce FCM token'ı kontrol eder ve Supabase'e kaydeder.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  getExistingSubscription,
  savePushSubscriptionToSupabase,
  type PushSubJSON,
} from '../lib/pushSubscription';
import { getFCMToken, onFCMMessage, checkAndSaveFCMToken } from '../lib/firebase';

// ─── Tipler ──────────────────────────────────────────────────────────────────

/** Abonelik durum makinesi */
export type SubscriptionStatus =
  | 'idle'             // Henüz başlatılmadı / abone değil
  | 'unsupported'      // Tarayıcı push'u desteklemiyor
  | 'checking'         // Mevcut abonelik kontrol ediliyor
  | 'permission-denied'// Kullanıcı izni reddetti
  | 'subscribing'      // Abonelik oluşturuluyor
  | 'subscribed'       // Aktif abonelik var
  | 'error';           // Hata oluştu

export interface UseNotificationsReturn {
  /** Tarayıcının bildirim izni */
  permission: NotificationPermission;
  /** Abonelik durum makinesi */
  status: SubscriptionStatus;
  /** Aktif push aboneliği (subscribed durumundayken dolu) */
  subscription: PushSubJSON | null;
  /** Son hata mesajı */
  error: string | null;
  /**
   * Bildirim iznini iste ve abonelik oluştur.
   * ⚠️ SADECE kullanıcı tıklaması sonrasında çağırın (iOS zorunluluğu).
   */
  subscribe: () => Promise<void>;
  /** Mevcut aboneliği iptal et */
  unsubscribe: () => Promise<void>;
}

type UseNotificationsOptions = {
  /** Supabase auth user id. Push aboneliğine bu id yazılır. */
  userId: string | null;
};

// ─── Toast Yardımcı Fonksiyonu ────────────────────────────────────────────────

/**
 * Geçici bir hata toast/alert gösterir.
 * Gerçek bir toast kütüphanesi yoksa basit bir banner oluşturur.
 *
 * Projenize react-toastify, sonner, react-hot-toast vb. eklenirse
 * bu fonksiyon kütüphane çağrısıyla değiştirilebilir.
 */
function showFCMErrorToast(message: string): void {
  try {
    // Mevcut container varsa tekrar oluşturma
    const existingToast = document.getElementById('fcm-error-toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.id = 'fcm-error-toast';
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.style.cssText = [
      'position:fixed',
      'bottom:80px',
      'left:50%',
      'transform:translateX(-50%)',
      'max-width:90vw',
      'width:360px',
      'background:#1e293b',
      'color:#f87171',
      'border:1px solid #ef4444',
      'border-radius:12px',
      'padding:12px 16px',
      'font-size:13px',
      'line-height:1.5',
      'z-index:99999',
      'box-shadow:0 4px 24px rgba(0,0,0,0.4)',
      'animation:fcmToastIn 0.3s ease',
    ].join(';');

    // CSS animasyonu
    if (!document.getElementById('fcm-toast-style')) {
      const style = document.createElement('style');
      style.id = 'fcm-toast-style';
      style.textContent = `
        @keyframes fcmToastIn {
          from { opacity:0; transform:translateX(-50%) translateY(12px); }
          to   { opacity:1; transform:translateX(-50%) translateY(0); }
        }
      `;
      document.head.appendChild(style);
    }

    toast.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <span style="font-size:18px;flex-shrink:0;">⚠️</span>
        <div>
          <strong style="display:block;margin-bottom:2px;color:#fca5a5;">FCM Token Hatası</strong>
          <span style="color:#94a3b8;">${message}</span>
        </div>
        <button onclick="this.closest('#fcm-error-toast').remove()"
          style="margin-left:auto;background:none;border:none;color:#64748b;cursor:pointer;font-size:16px;padding:0;flex-shrink:0;">✕</button>
      </div>
    `;

    document.body.appendChild(toast);

    // 8 saniye sonra otomatik kaldır
    setTimeout(() => toast.remove(), 8000);
  } catch (e) {
    // Toast gösterilemezse en azından console'a yaz
    console.error('[useNotifications] Toast gösterilemedi:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useNotifications({ userId }: UseNotificationsOptions): UseNotificationsReturn {
  const [permission, setPermission] = useState<NotificationPermission>(
    () => (typeof Notification !== 'undefined' ? Notification.permission : 'default')
  );
  const [status, setStatus]         = useState<SubscriptionStatus>('idle');
  const [subscription, setSubscription] = useState<PushSubJSON | null>(null);
  const [error, setError]           = useState<string | null>(null);

  // ── Sayfa yüklendiğinde mevcut aboneliği kontrol et ─────────────────────
  useEffect(() => {
    if (!isPushSupported()) {
      setStatus('unsupported');
      return;
    }

    setStatus('checking');

    getExistingSubscription()
      .then((existing) => {
        if (existing) {
          setSubscription(existing);
          setStatus('subscribed');
          setPermission('granted');
        } else {
          setStatus('idle');
        }
      })
      .catch(() => setStatus('idle'));
  }, []);

  // ── Uygulama açıldığında / userId değiştiğinde FCM token'ı arka planda kontrol et ──
  useEffect(() => {
    if (!userId) return;
    if (!isPushSupported()) return;

    // Sessizce arka planda çalışır — bildirim izni yoksa hiçbir şey yapmaz.
    // Hata oluşursa hem console.error hem toast gösterilir.
    void checkAndSaveFCMToken(userId, (errMsg) => {
      console.error('[useNotifications] checkAndSaveFCMToken hatası:', errMsg);
      showFCMErrorToast(errMsg);
    });
  }, [userId]); // userId değişince (giriş/çıkış) yeniden çalışır

  // ── SW'den gelen abonelik yenileme mesajını dinle ────────────────────────
  useEffect(() => {
    if (!isPushSupported()) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'SW_SUBSCRIPTION_RENEWED') {
        const renewed = event.data.subscription as PushSubJSON;
        setSubscription(renewed);
        // Yenilenen aboneliği Supabase'e de kaydet (userId ile)
        void savePushSubscriptionToSupabase(renewed, userId);
        console.log('[useNotifications] Abonelik yenilendi:', renewed.endpoint);
      }
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  // ── subscribe ─────────────────────────────────────────────────────────────
  /**
   * Bildirim iznini ister ve push aboneliği oluşturur.
   * iOS gereksinimi: Doğrudan bir kullanıcı tıklaması event handler'ından çağrılmalı.
   */
  const subscribe = useCallback(async () => {
    if (!isPushSupported()) {
      setStatus('unsupported');
      setError('Bu tarayıcı Web Push bildirimlerini desteklemiyor.');
      return;
    }

    setError(null);
    setStatus('subscribing');

    // ── 1. Web Push (VAPID) aboneliği ───────────────────────────────
    const result = await subscribeToPush(userId); // Aktif kullanıcı ID'sini yaz

    if (result.ok) {
      setSubscription(result.subscription);
      setStatus('subscribed');
      setPermission('granted');
      console.log('[useNotifications] Web Push aboneliği tamamlandı:', result.subscription.endpoint);
    } else {
      setError(result.message);
      setStatus(result.reason === 'denied' ? 'permission-denied' : 'error');
      if (result.reason === 'denied') setPermission('denied');
      return; // İzin yoksa FCM de çalışmaz
    }

    // ── 2. Firebase FCM Token ───────────────────────────────────
    // Web Push'tan bağımsız olarak FCM token al ve Supabase'e kaydet.
    // userId yoksa token alınır ama kaydedilemez — uyarı verilir.
    if (!userId) {
      console.warn('[useNotifications] userId boş — FCM token Supabase\'e kaydedilemeyecek.');
      showFCMErrorToast('Oturum bilgisi bulunamadı. FCM token kaydedilemedi. Tekrar giriş yapmayı deneyin.');
      return;
    }

    getFCMToken(userId).then((fcmResult) => {
      if (fcmResult.ok) {
        console.log('[useNotifications] ✅ FCM token kaydedildi.');
      } else {
        const errMsg = `FCM token hatası (${fcmResult.reason}): ${fcmResult.message}`;
        console.error('[useNotifications]', errMsg);
        showFCMErrorToast(fcmResult.message);
      }
    }).catch((err) => {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[useNotifications] FCM token beklenmeyen hata:', err);
      showFCMErrorToast(`FCM token beklenmeyen hata: ${errMsg}`);
    });
  }, [userId]);

  // ── unsubscribe ───────────────────────────────────────────────────────────
  const unsubscribe = useCallback(async () => {
    setError(null);

    try {
      await unsubscribeFromPush();
      setSubscription(null);
      setStatus('idle');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
      setError(`Abonelik iptal edilemedi: ${message}`);
      console.error('[useNotifications] unsubscribe hatası:', err);
    }
  }, []);

  // ── Ön plan FCM mesaj dinleyici ──────────────────────────────
  // Uygulama açıkken FCM mesajı geldiğinde tarayıcı otomatik bildirim göstermez.
  // Bu effect, uygulamayi açıkken de bildirim gösterir.
  useEffect(() => {
    if (!isPushSupported()) return;

    const unsubscribeFCM = onFCMMessage((payload) => {
      console.log('[useNotifications] Ön plan FCM mesajı:', payload);

      const title = payload.notification?.title ?? payload.data?.title ?? 'Günlük Görev';
      const body  = payload.notification?.body  ?? payload.data?.body  ?? 'Yeni bir hatırlatıcınız var.';
      const icon  = payload.notification?.icon  ?? '/icons/icon-192.png';

      // Ön planda manuel bildirim göster
      if (Notification.permission === 'granted') {
        new Notification(title, { body, icon });
      }
    });

    return () => unsubscribeFCM();
  }, []);

  return { permission, status, subscription, error, subscribe, unsubscribe };
}
