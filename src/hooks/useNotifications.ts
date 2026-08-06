/**
 * useNotifications.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Web Push bildirim abonelik yönetimi.
 *
 * Mimari:
 *  - subscribeToPush()  → pushSubscription.ts üzerinden VAPID + Supabase
 *  - iOS uyumu: subscribe() fonksiyonu SADECE kullanıcı etkileşimiyle çağrılır
 *  - SW renewal: pushsubscriptionchange mesajını dinler ve Supabase'i günceller
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
import { getFCMToken, onFCMMessage } from '../lib/firebase';

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
    // Hata olsa bile Web Push aboneliğini bloke etme.
    getFCMToken(userId).then((fcmResult) => {
      if (fcmResult.ok) {
        console.log('[useNotifications] FCM token kaydedildi.');
      } else {
        console.warn('[useNotifications] FCM token alınamadı:', fcmResult.message);
      }
    }).catch((err) => {
      console.error('[useNotifications] FCM token hatası:', err);
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

    const unsubscribe = onFCMMessage((payload) => {
      console.log('[useNotifications] Ön plan FCM mesajı:', payload);

      const title = payload.notification?.title ?? payload.data?.title ?? 'Günlük Görev';
      const body  = payload.notification?.body  ?? payload.data?.body  ?? 'Yeni bir hatırlatıcınız var.';
      const icon  = payload.notification?.icon  ?? '/icons/icon-192.png';

      // Ön planda manuel bildirim göster
      if (Notification.permission === 'granted') {
        new Notification(title, { body, icon });
      }
    });

    return () => unsubscribe();
  }, []);

  return { permission, status, subscription, error, subscribe, unsubscribe };
}
