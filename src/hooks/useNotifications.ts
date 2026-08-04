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

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useNotifications(): UseNotificationsReturn {
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
        // Yenilenen aboneliği Supabase'e de kaydet
        void savePushSubscriptionToSupabase(renewed, null);
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

    const result = await subscribeToPush(null); // userId = null (auth yokken)

    if (result.ok) {
      setSubscription(result.subscription);
      setStatus('subscribed');
      setPermission('granted');
      console.log('[useNotifications] Abonelik tamamlandı:', result.subscription.endpoint);
    } else {
      setError(result.message);
      setStatus(result.reason === 'denied' ? 'permission-denied' : 'error');
      if (result.reason === 'denied') setPermission('denied');
    }
  }, []);

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

  return { permission, status, subscription, error, subscribe, unsubscribe };
}
