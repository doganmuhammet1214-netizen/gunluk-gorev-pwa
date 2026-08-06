/**
 * firebase.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Firebase uygulamasını başlatır ve FCM (Cloud Messaging) token yönetimini sağlar.
 *
 * Mimari:
 *  - Firebase app singleton olarak başlatılır (çift başlatmayı önler).
 *  - getFCMToken(): Bildirim izni varsa FCM token alır, Supabase'e kaydeder.
 *  - saveFCMTokenToSupabase(): Token'ı user_fcm_tokens tablosuna upsert eder.
 *
 * Gerekli .env değişkenleri:
 *  VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
 *  VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID,
 *  VITE_FIREBASE_APP_ID, VITE_FIREBASE_VAPID_KEY
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging';
import { supabase } from './supabase';

// ─── Firebase Konfigürasyonu ──────────────────────────────────────────────────

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            as string,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        as string,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         as string,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             as string,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID     as string | undefined,
};

// Singleton: Uygulama zaten başlatılmışsa mevcut instance'ı kullan
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// ─── FCM Messaging Singleton ──────────────────────────────────────────────────

/**
 * FCM Messaging instance'ını döner.
 * Service Worker desteklenmiyorsa null döner.
 */
export function getFirebaseMessaging(): Messaging | null {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    return getMessaging(app);
  } catch (err) {
    console.error('[firebase] Messaging başlatılamadı:', err);
    return null;
  }
}

// ─── FCM Token Alma ───────────────────────────────────────────────────────────

export type FCMTokenResult =
  | { ok: true;  token: string }
  | { ok: false; reason: 'unsupported' | 'denied' | 'sw_error' | 'error'; message: string };

/**
 * FCM token alır.
 *  1. Bildirim iznini kontrol eder (izin yoksa ister).
 *  2. firebase-messaging-sw.js SW'sini kaydeder.
 *  3. VAPID key ile FCM token üretir.
 *  4. Token'ı Supabase'e kaydeder.
 *
 * ⚠️ iOS gereksinimi: SADECE kullanıcı tıklamasından çağırın.
 */
export async function getFCMToken(userId?: string | null): Promise<FCMTokenResult> {
  // 1. Tarayıcı desteği kontrolü
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return { ok: false, reason: 'unsupported', message: 'Bu tarayıcı Service Worker desteklemiyor.' };
  }

  const messaging = getFirebaseMessaging();
  if (!messaging) {
    return { ok: false, reason: 'unsupported', message: 'Firebase Messaging başlatılamadı.' };
  }

  // 2. Bildirim izni kontrolü / isteme
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      reason: 'denied',
      message: 'Bildirim izni reddedildi. Tarayıcı ayarlarından etkinleştirebilirsiniz.',
    };
  }

  // 3. firebase-messaging-sw.js'yi kaydet (veya mevcut kaydı al)
  let swRegistration: ServiceWorkerRegistration | undefined;
  try {
    swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/firebase-cloud-messaging-push-scope',
    });
    await navigator.serviceWorker.ready;
  } catch (err) {
    console.error('[firebase] SW kaydı başarısız:', err);
    return { ok: false, reason: 'sw_error', message: 'Service Worker kaydı başarısız.' };
  }

  // 4. FCM token al
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
  if (!vapidKey) {
    console.warn('[firebase] VITE_FIREBASE_VAPID_KEY tanımlı değil!');
  }

  try {
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: swRegistration,
    });

    if (!token) {
      return { ok: false, reason: 'error', message: 'FCM token alınamadı.' };
    }

    console.log('[firebase] FCM Token alındı:', token.slice(0, 20) + '...');

    // 5. Token'ı Supabase'e kaydet
    await saveFCMTokenToSupabase(token, userId);

    return { ok: true, token };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    console.error('[firebase] getToken hatası:', err);
    return { ok: false, reason: 'error', message };
  }
}

// ─── Supabase'e FCM Token Kaydet ─────────────────────────────────────────────

/**
 * FCM token'ı Supabase `user_fcm_tokens` tablosuna upsert eder.
 * Aynı token varsa günceller; yoksa yeni satır ekler.
 *
 * Tablo şeması (SQL migration gerekebilir):
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ CREATE TABLE user_fcm_tokens (                                  │
 * │   id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),       │
 * │   user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE, │
 * │   fcm_token   text NOT NULL UNIQUE,                             │
 * │   device_label text,                                            │
 * │   created_at  timestamptz DEFAULT now(),                        │
 * │   updated_at  timestamptz DEFAULT now()                         │
 * │ );                                                              │
 * └─────────────────────────────────────────────────────────────────┘
 */
export async function saveFCMTokenToSupabase(
  token: string,
  userId?: string | null
): Promise<void> {
  const deviceLabel = navigator.userAgent.slice(0, 150) || 'Bilinmeyen Cihaz';

  const { error } = await supabase
    .from('user_fcm_tokens')
    .upsert(
      {
        fcm_token:    token,
        user_id:      userId ?? null,
        device_label: deviceLabel,
        updated_at:   new Date().toISOString(),
      } as any,
      { onConflict: 'fcm_token' }
    );

  if (error) {
    console.error('[firebase] Supabase FCM token kayıt hatası:', error);
    // Kritik değil — token kaydedilemese de bildirim akışı devam edebilir
  } else {
    console.log('[firebase] FCM token Supabase\'e kaydedildi.');
  }
}

// ─── Ön Plan Mesaj Dinleyici ──────────────────────────────────────────────────

/**
 * Uygulama ön planda (focused) iken FCM mesajı geldiğinde tetiklenir.
 * Tarayıcı bu durumda otomatik bildirim göstermez — manuel göstermeniz gerekir.
 *
 * @param callback  Mesaj payload'ını alacak fonksiyon
 * @returns         Aboneliği iptal eden unsubscribe fonksiyonu
 */
export function onFCMMessage(
  callback: (payload: Parameters<Parameters<typeof onMessage>[1]>[0]) => void
): (() => void) {
  const messaging = getFirebaseMessaging();
  if (!messaging) return () => {};

  const unsubscribe = onMessage(messaging, callback);
  return unsubscribe;
}

export { app };
