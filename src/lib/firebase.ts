/**
 * firebase.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Firebase uygulamasını başlatır ve FCM (Cloud Messaging) token yönetimini sağlar.
 *
 * Mimari:
 *  - Firebase app singleton olarak başlatılır (çift başlatmayı önler).
 *  - ensureSWRegistered(): firebase-messaging-sw.js'yi güvenle kaydeder/mevcut kaydı döner.
 *  - getFCMToken(): Bildirim izni varsa FCM token alır, Supabase'e kaydeder.
 *  - saveFCMTokenToSupabase(): Token'ı user_fcm_tokens tablosuna upsert eder.
 *  - checkAndSaveFCMToken(): Uygulama açılışında arka planda sessizce çalışır.
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

// ─── Service Worker Kaydı ────────────────────────────────────────────────────

/**
 * firebase-messaging-sw.js Service Worker'ını güvenli biçimde kaydeder.
 * Tarayıcıda zaten kayıtlıysa mevcut kaydı döner; aksi hâlde yeni kayıt oluşturur.
 * getToken() çağrısından önce mutlaka bu fonksiyon çağrılmalıdır.
 */
export async function ensureSWRegistered(): Promise<ServiceWorkerRegistration> {
  // Önce mevcut kayıtları kontrol et — zaten kayıtlıysa yeniden kaydetme
  const registrations = await navigator.serviceWorker.getRegistrations();
  const existing = registrations.find(
    (r) =>
      r.active?.scriptURL.includes('firebase-messaging-sw.js') ||
      r.installing?.scriptURL.includes('firebase-messaging-sw.js') ||
      r.waiting?.scriptURL.includes('firebase-messaging-sw.js')
  );
  if (existing) {
    console.log('[firebase] SW zaten kayıtlı, mevcut kayıt kullanılıyor:', existing.scope);
    return existing;
  }

  // Yeni kayıt oluştur
  const registration = await navigator.serviceWorker.register(
    '/firebase-messaging-sw.js',
    { scope: '/firebase-cloud-messaging-push-scope' }
  );
  // SW aktif hâle gelene dek bekle
  await navigator.serviceWorker.ready;
  console.log('[firebase] SW başarıyla kaydedildi:', registration.scope);
  return registration;
}

// ─── FCM Token Sonuç Tipi ────────────────────────────────────────────────────

export type FCMTokenResult =
  | { ok: true;  token: string }
  | { ok: false; reason: 'unsupported' | 'denied' | 'sw_error' | 'vapid_missing' | 'no_user' | 'error'; message: string };

// ─── FCM Token Alma ───────────────────────────────────────────────────────────

/**
 * FCM token alır ve Supabase user_fcm_tokens tablosuna kaydeder.
 *
 *  1. Tarayıcı desteğini kontrol eder.
 *  2. Bildirim iznini kontrol eder / ister.
 *  3. firebase-messaging-sw.js SW'sini kaydeder (veya mevcut kaydı alır).
 *  4. VAPID key varlığını doğrular.
 *  5. getToken() ile FCM token üretir.
 *  6. Token'ı Supabase'e upsert eder.
 *
 * ⚠️ iOS gereksinimi: SADECE kullanıcı tıklamasından çağırın.
 *
 * @param userId  Supabase auth kullanıcı ID'si — token kaydı için gerekli.
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
  let swRegistration: ServiceWorkerRegistration;
  try {
    swRegistration = await ensureSWRegistered();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[firebase] SW kaydı başarısız:', err);
    return { ok: false, reason: 'sw_error', message: `Service Worker kaydı başarısız: ${msg}` };
  }

  // 4. VAPID key varlık kontrolü
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
  if (!vapidKey) {
    const msg = 'VITE_FIREBASE_VAPID_KEY .env dosyasında tanımlı değil!';
    console.error('[firebase]', msg);
    return { ok: false, reason: 'vapid_missing', message: msg };
  }

  // 5. FCM token al
  let token: string;
  try {
    const rawToken = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swRegistration });
    if (!rawToken) {
      const msg = 'getToken() boş döndü. VAPID key veya SW kaydını kontrol edin.';
      console.error('[firebase]', msg);
      return { ok: false, reason: 'error', message: msg };
    }
    token = rawToken;
    console.log('[firebase] FCM Token alındı:', token.slice(0, 30) + '...');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[firebase] getToken() hatası:', err);
    return { ok: false, reason: 'error', message: `FCM token alınamadı: ${msg}` };
  }

  // 6. userId kontrolü
  if (!userId) {
    console.warn('[firebase] getFCMToken: userId boş — token Supabase\'e kaydedilemedi.');
    // Token alındı ama kaydedilemedi; yine de ok: true döndür (bildirim akışı için token geçerli)
    return { ok: true, token };
  }

  // 7. Token'ı Supabase'e kaydet
  await saveFCMTokenToSupabase(token, userId);

  return { ok: true, token };
}

// ─── Supabase'e FCM Token Kaydet ─────────────────────────────────────────────

/**
 * FCM token'ı Supabase `user_fcm_tokens` tablosuna upsert eder.
 * Aynı token varsa günceller (onConflict: 'fcm_token'); yoksa yeni satır ekler.
 *
 * Tablo şeması (supabase/migrations/20260806_user_fcm_tokens.sql):
 *   user_id      uuid
 *   fcm_token    text NOT NULL UNIQUE
 *   device_label text
 *   updated_at   timestamptz
 *
 * @param token   FCM token string'i
 * @param userId  Supabase auth kullanıcı ID'si — RLS için zorunlu
 */
export async function saveFCMTokenToSupabase(
  token: string,
  userId?: string | null
): Promise<void> {
  if (!userId) {
    console.error(
      '[firebase] saveFCMTokenToSupabase: userId boş! ' +
      'Supabase RLS (auth.uid() = user_id) INSERT\'ü reddeder. ' +
      'Kullanıcının oturum açtığından emin olun.'
    );
    return;
  }

  const deviceLabel = navigator.userAgent.slice(0, 150) || 'Bilinmeyen Cihaz';

  const { error } = await supabase
    .from('user_fcm_tokens')
    .upsert(
      {
        user_id:      userId,
        fcm_token:    token,
        device_label: deviceLabel,
        updated_at:   new Date().toISOString(),
      } as any,
      { onConflict: 'fcm_token' }
    );

  if (error) {
    console.error('[firebase] Supabase FCM token kayıt hatası:', {
      code:    error.code,
      message: error.message,
      details: error.details,
      hint:    error.hint,
    });
  } else {
    console.log('[firebase] ✅ FCM token Supabase\'e kaydedildi. user_id:', userId);
  }
}

// ─── Arka Plan Sessiz Kontrol ─────────────────────────────────────────────────

/**
 * Uygulama açılışında veya kullanıcı giriş yaptığında arka planda sessizce çalışır.
 *
 * - Bildirim izni zaten 'granted' ise FCM token alıp Supabase'e kaydeder.
 * - İzin 'default' veya 'denied' ise sessizce çıkar (kullanıcıya popup göstermez).
 * - Hata olursa console.error ile raporlar; onError callback'i tetiklenir (toast/alert için).
 *
 * ⚠️ Bu fonksiyon bildirim izni ISTEMEZ. İzin almak için getFCMToken() kullanın.
 *
 * @param userId    Supabase auth kullanıcı ID'si
 * @param onError   (opsiyonel) Hata callback'i — toast/alert göstermek için kullanın
 */
export async function checkAndSaveFCMToken(
  userId: string | null | undefined,
  onError?: (message: string) => void
): Promise<void> {
  if (!userId) {
    console.log('[firebase] checkAndSaveFCMToken: userId yok, atlanıyor.');
    return;
  }
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  // Sadece izin zaten verilmişse çalış
  if (Notification.permission !== 'granted') {
    console.log(
      '[firebase] checkAndSaveFCMToken: bildirim izni yok, sessizce çıkılıyor. ' +
      'Mevcut izin:', Notification.permission
    );
    return;
  }

  const messaging = getFirebaseMessaging();
  if (!messaging) return;

  try {
    // SW kaydını kontrol et / yap
    let swRegistration: ServiceWorkerRegistration;
    try {
      swRegistration = await ensureSWRegistered();
    } catch (err) {
      const msg = `Service Worker kaydı başarısız: ${err instanceof Error ? err.message : String(err)}`;
      console.error('[firebase] checkAndSaveFCMToken SW hatası:', err);
      onError?.(msg);
      return;
    }

    // VAPID key
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
    if (!vapidKey) {
      const msg = 'VITE_FIREBASE_VAPID_KEY .env dosyasında tanımlı değil!';
      console.error('[firebase]', msg);
      onError?.(msg);
      return;
    }

    // FCM token al
    const rawToken = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: swRegistration,
    });
    if (!rawToken) {
      console.warn('[firebase] checkAndSaveFCMToken: getToken() boş döndü.');
      return;
    }
    console.log('[firebase] checkAndSaveFCMToken: token alındı, kaydediliyor...');

    // Önceki kayıtla kıyasla — değişmediyse tekrar yazmaya gerek yok
    const { data: existing } = await supabase
      .from('user_fcm_tokens')
      .select('fcm_token')
      .eq('user_id', userId)
      .eq('fcm_token', rawToken)
      .maybeSingle();

    if (existing) {
      console.log('[firebase] checkAndSaveFCMToken: token zaten kayıtlı, atlanıyor.');
      return;
    }

    // Supabase'e kaydet
    const { error } = await supabase
      .from('user_fcm_tokens')
      .upsert(
        {
          user_id:      userId,
          fcm_token:    rawToken,
          device_label: navigator.userAgent.slice(0, 150) || 'Bilinmeyen Cihaz',
          updated_at:   new Date().toISOString(),
        } as any,
        { onConflict: 'fcm_token' }
      );

    if (error) {
      const msg = `FCM token kaydedilemedi: ${error.message} (kod: ${error.code})`;
      console.error('[firebase] checkAndSaveFCMToken Supabase hatası:', {
        code:    error.code,
        message: error.message,
        details: error.details,
        hint:    error.hint,
      });
      onError?.(msg);
    } else {
      console.log('[firebase] ✅ checkAndSaveFCMToken: token başarıyla kaydedildi.');
    }
  } catch (err) {
    const msg = `FCM token kontrolü başarısız: ${err instanceof Error ? err.message : String(err)}`;
    console.error('[firebase] checkAndSaveFCMToken beklenmeyen hata:', err);
    onError?.(msg);
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
