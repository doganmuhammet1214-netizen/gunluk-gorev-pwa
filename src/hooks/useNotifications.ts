import { useState, useEffect, useCallback, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Tipler
// ─────────────────────────────────────────────────────────────────────────────

/** Bildirim izni durumu */
export type NotificationPermission = 'default' | 'granted' | 'denied';

/** Push aboneliği durum makinesi */
export type SubscriptionStatus =
  | 'idle'           // Hook henüz başlatılmadı
  | 'unsupported'    // Tarayıcı push'u desteklemiyor
  | 'checking'       // SW kaydı + abonelik kontrol ediliyor
  | 'permission-denied'  // Kullanıcı izni reddetti
  | 'subscribing'    // Abonelik oluşturuluyor
  | 'subscribed'     // Abonelik aktif
  | 'error';         // Bir hata oluştu

export interface PushSubscriptionJSON {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface UseNotificationsReturn {
  /** Tarayıcının bildirim izni */
  permission: NotificationPermission;
  /** Abonelik durum makinesi */
  status: SubscriptionStatus;
  /** Aktif push aboneliği (subscribed durumundayken dolu) */
  subscription: PushSubscriptionJSON | null;
  /** Son hata mesajı */
  error: string | null;
  /** İzin iste + SW kaydet + abonelik oluştur */
  subscribe: () => Promise<void>;
  /** Mevcut aboneliği iptal et */
  unsubscribe: () => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// VAPID public key
// ─────────────────────────────────────────────────────────────────────────────
// Gerçek push için web-push kütüphanesiyle üretilen VAPID public key'i
// .env dosyanıza VITE_VAPID_PUBLIC_KEY=<base64url> olarak ekleyin.
// Henüz yoksa boş bırakın — userVisibleOnly:true ile de çalışır ama
// Firefox gibi tarayıcılar VAPID olmadan kabul etmeyebilir.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

/**
 * Base64url → Uint8Array dönüşümü (VAPID key için gerekli)
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────
export function useNotifications(): UseNotificationsReturn {
  const [permission, setPermission] = useState<NotificationPermission>(
    () => (typeof Notification !== 'undefined' ? Notification.permission : 'default')
  );
  const [status, setStatus] = useState<SubscriptionStatus>('idle');
  const [subscription, setSubscription] = useState<PushSubscriptionJSON | null>(null);
  const [error, setError] = useState<string | null>(null);

  // SW registration referansı — tekrar kaydetmemek için tutuyoruz
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  // ── Tarayıcı desteği ────────────────────────────────────────────────────
  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  // ── Mevcut aboneliği yükle (ilk render) ─────────────────────────────────
  useEffect(() => {
    if (!isSupported) {
      setStatus('unsupported');
      return;
    }

    setStatus('checking');

    navigator.serviceWorker
      .getRegistration('/sw.js')
      .then(async (reg) => {
        if (!reg) {
          setStatus('idle');
          return;
        }
        swRegistrationRef.current = reg;
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          setSubscription(existing.toJSON() as PushSubscriptionJSON);
          setStatus('subscribed');
        } else {
          setStatus('idle');
        }
      })
      .catch((err) => {
        console.error('[useNotifications] Mevcut abonelik kontrol hatası:', err);
        setStatus('idle');
      });
  }, [isSupported]);

  // ── SW kayıt yardımcısı ─────────────────────────────────────────────────
  const ensureServiceWorker = useCallback(async (): Promise<ServiceWorkerRegistration> => {
    if (swRegistrationRef.current) return swRegistrationRef.current;

    const reg = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    // SW aktif olana kadar bekle
    await navigator.serviceWorker.ready;

    swRegistrationRef.current = reg;
    return reg;
  }, []);

  // ── subscribe ───────────────────────────────────────────────────────────
  const subscribe = useCallback(async () => {
    if (!isSupported) {
      setStatus('unsupported');
      setError('Bu tarayıcı push bildirimlerini desteklemiyor.');
      return;
    }

    setError(null);

    // 1. Bildirim izni iste
    const perm = await Notification.requestPermission();
    setPermission(perm);

    if (perm !== 'granted') {
      setStatus('permission-denied');
      setError('Bildirim izni reddedildi. Lütfen tarayıcı ayarlarından izin verin.');
      return;
    }

    setStatus('subscribing');

    try {
      // 2. Service Worker'ı kaydet / al
      const reg = await ensureServiceWorker();

      // 3. Push aboneliği oluştur
      const subscribeOptions: PushSubscriptionOptionsInit = {
        userVisibleOnly: true, // Kullanıcıya görünür bildirimler zorunlu
      };

      // VAPID key mevcutsa ekle (üretim için önerilir)
      if (VAPID_PUBLIC_KEY) {
        subscribeOptions.applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      }

      const pushSub = await reg.pushManager.subscribe(subscribeOptions);
      const subJson = pushSub.toJSON() as PushSubscriptionJSON;

      setSubscription(subJson);
      setStatus('subscribed');

      console.log('[useNotifications] Push aboneliği oluşturuldu:', subJson.endpoint);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bilinmeyen hata';
      setError(`Abonelik oluşturulamadı: ${msg}`);
      setStatus('error');
      console.error('[useNotifications] subscribe hatası:', err);
    }
  }, [isSupported, ensureServiceWorker]);

  // ── unsubscribe ─────────────────────────────────────────────────────────
  const unsubscribe = useCallback(async () => {
    if (!isSupported) return;

    try {
      const reg = swRegistrationRef.current ?? (await navigator.serviceWorker.getRegistration('/sw.js'));
      if (!reg) return;

      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await existing.unsubscribe();
      }

      setSubscription(null);
      setStatus('idle');
      console.log('[useNotifications] Abonelik iptal edildi.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bilinmeyen hata';
      setError(`Abonelik iptal edilemedi: ${msg}`);
      console.error('[useNotifications] unsubscribe hatası:', err);
    }
  }, [isSupported]);

  // ── pushsubscriptionchange mesajını dinle ────────────────────────────────
  // SW, abonelik yenilenince bu mesajı gönderir
  useEffect(() => {
    if (!isSupported) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_SUBSCRIPTION_RENEWED') {
        const renewed = event.data.subscription as PushSubscriptionJSON;
        setSubscription(renewed);
        console.log('[useNotifications] Abonelik yenilendi:', renewed.endpoint);
      }
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [isSupported]);

  return {
    permission,
    status,
    subscription,
    error,
    subscribe,
    unsubscribe,
  };
}
