/**
 * pushSubscription.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * iOS PWA uyumlu Web Push abonelik yardımcıları.
 *
 * Önemli iOS kısıtlamaları:
 *  - Bildirim izni MUTLAKA kullanıcı etkileşimiyle (tıklama) tetiklenmelidir.
 *  - Bu fonksiyonları sayfa açılışında değil, butona tıklandığında çağırın.
 *  - iOS 16.4+ Safari + Ana Ekrana Ekleme gerektirir.
 */

import { supabase } from './supabase';

// ─── Tipler ──────────────────────────────────────────────────────────────────

export interface PushSubJSON {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
}

export type SubscribeResult =
  | { ok: true;  subscription: PushSubJSON }
  | { ok: false; reason: 'unsupported' | 'denied' | 'error'; message: string };

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

/** Base64url dizesini Uint8Array'e dönüştürür (VAPID key için gerekli). */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Tarayıcının Web Push'u destekleyip desteklemediğini kontrol eder. */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

// ─── Service Worker Kaydı ────────────────────────────────────────────────────

/**
 * Service Worker'ı kaydeder (ya da mevcut kaydı döner).
 * VitePWA generateSW stratejisiyle `/sw.js` endpoint'ini kullanır.
 */
async function ensureSW(): Promise<ServiceWorkerRegistration> {
  // Var olan kaydı kullan
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) {
    await navigator.serviceWorker.ready;
    return existing;
  }

  // Yoksa kaydet
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  return reg;
}

// ─── Ana Abonelik Fonksiyonu ─────────────────────────────────────────────────

/**
 * Kullanıcıdan bildirim izni alır, VAPID ile push aboneliği oluşturur
 * ve Supabase `push_subscriptions` tablosuna kaydeder.
 *
 * ⚠️ iOS gereksinimi: Bu fonksiyon SADECE kullanıcı etkileşimi (tıklama)
 * sonrasında çağrılmalıdır.
 *
 * @param userId  Supabase auth user id (opsiyonel, auth yoksa null bırakın)
 * @returns       Başarı/hata sonucu
 */
export async function subscribeToPush(
  userId?: string | null
): Promise<SubscribeResult> {
  // 1. Tarayıcı desteği kontrolü
  if (!isPushSupported()) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'Bu tarayıcı Web Push bildirimlerini desteklemiyor.',
    };
  }

  // 2. Bildirim izni iste (KULLANICI ETKİLEŞİMİ GEREKTİRİR)
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      reason: 'denied',
      message: 'Bildirim izni reddedildi. Tarayıcı ayarlarından etkinleştirebilirsiniz.',
    };
  }

  // 3. VAPID public key'ini al
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!vapidKey) {
    console.warn('[pushSubscription] VITE_VAPID_PUBLIC_KEY tanımlı değil!');
  }

  try {
    // 4. SW kaydını al/oluştur
    const reg = await ensureSW();

    // 5. Mevcut aboneliği iptal et (temiz başlangıç)
    const oldSub = await reg.pushManager.getSubscription();
    if (oldSub) await oldSub.unsubscribe();

    // 6. Yeni push aboneliği oluştur
    const subscribeOptions: PushSubscriptionOptionsInit = {
      userVisibleOnly: true,
    };
    if (vapidKey) {
      subscribeOptions.applicationServerKey = urlBase64ToUint8Array(vapidKey);
    }

    const pushSub = await reg.pushManager.subscribe(subscribeOptions);
    const subJSON = pushSub.toJSON() as PushSubJSON;

    // 7. Supabase'e kaydet / güncelle
    await savePushSubscriptionToSupabase(subJSON, userId);

    return { ok: true, subscription: subJSON };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    console.error('[pushSubscription] subscribeToPush hatası:', err);
    return { ok: false, reason: 'error', message };
  }
}

// ─── Supabase Kayıt ──────────────────────────────────────────────────────────

/**
 * Push aboneliğini Supabase `push_subscriptions` tablosuna upsert eder.
 * Aynı endpoint varsa günceller; yoksa yeni satır ekler.
 */
export async function savePushSubscriptionToSupabase(
  sub: PushSubJSON,
  userId?: string | null
): Promise<void> {
  const deviceLabel = navigator.userAgent.slice(0, 100) || 'Bilinmeyen Cihaz';

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        endpoint:     sub.endpoint,
        p256dh:       sub.keys.p256dh,
        auth:         sub.keys.auth,
        device_label: deviceLabel,
        user_id:      userId ?? null,
      } as any,
      { onConflict: 'endpoint' }
    );

  if (error) {
    console.error('[pushSubscription] Supabase kayıt hatası:', error);
    throw error;
  }
}

// ─── Abonelik İptali ─────────────────────────────────────────────────────────

/**
 * Mevcut push aboneliğini hem tarayıcıdan hem Supabase'den siler.
 */
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;

  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg) return;

    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;

    const endpoint = sub.endpoint;
    await sub.unsubscribe();

    // Supabase'den de sil
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint);

    console.log('[pushSubscription] Abonelik iptal edildi.');
  } catch (err) {
    console.error('[pushSubscription] unsubscribeFromPush hatası:', err);
  }
}

// ─── Mevcut Aboneliği Kontrol Et ─────────────────────────────────────────────

/**
 * Tarayıcıda aktif bir push aboneliği olup olmadığını döner.
 * Sayfa yüklendiğinde UI durumunu belirlemek için kullanın.
 */
export async function getExistingSubscription(): Promise<PushSubJSON | null> {
  if (!isPushSupported()) return null;

  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg) return null;

    const sub = await reg.pushManager.getSubscription();
    if (!sub) return null;

    return sub.toJSON() as PushSubJSON;
  } catch {
    return null;
  }
}
