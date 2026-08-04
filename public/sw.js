// ─────────────────────────────────────────────────────────────────────────────
// sw.js — Günlük Görev PWA Service Worker
// Arka planda Web Push bildirimleri alır ve tıklamaları yönetir.
// VitePWA (generateSW) bu dosyayı importScripts ile dahil eder.
// ─────────────────────────────────────────────────────────────────────────────

const SW_VERSION = '2.0.0';
const APP_NAME   = 'Günlük Görev';

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', () => {
  // Bekleyen SW varsa hemen aktive et
  self.skipWaiting();
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  // Tüm açık sekmelerin kontrolünü hemen devral
  event.waitUntil(self.clients.claim());
});

// ── Push ──────────────────────────────────────────────────────────────────────
/**
 * QStash → Supabase Edge Function → Push endpoint üzerinden gelen push olayı.
 *
 * Beklenen JSON payload:
 * {
 *   "title":   "Görev Zamanı!",
 *   "body":    "\"Rapor hazırla\" görevini tamamlamayı unutma!",
 *   "icon":    "/icons/icon-192.png",
 *   "badge":   "/icons/icon-192.png",
 *   "tag":     "task-abc123",
 *   "data":    { "url": "/", "taskId": "abc123" }
 * }
 */
self.addEventListener('push', (event) => {
  // Varsayılan bildirim içeriği
  let payload = {
    title: APP_NAME,
    body:  'Yeni bir hatırlatıcınız var.',
    icon:  '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag:   'gunluk-gorev-reminder',
    data:  { url: '/' },
  };

  // Sunucudan gelen JSON payload'ı ayrıştır
  if (event.data) {
    try {
      const incoming = event.data.json();
      payload = { ...payload, ...incoming };
    } catch {
      // JSON değilse düz metin body olarak kullan
      payload.body = event.data.text();
    }
  }

  const options = {
    body:               payload.body,
    icon:               payload.icon,
    badge:              payload.badge,
    tag:                payload.tag,
    data:               payload.data,
    requireInteraction: false,
    silent:             false,
    // iOS 16.4+ — vibrasyon desteği
    vibrate:            [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

// ── Notification Click ────────────────────────────────────────────────────────
/**
 * Kullanıcı bildirime tıkladığında:
 * 1. Zaten açık bir uygulama sekmesi varsa ona odaklan.
 * 2. Yoksa yeni sekme/pencere aç.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url ?? '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Uygulamanın açık bir sekmesi var mı?
        for (const client of clientList) {
          const clientPath = new URL(client.url).pathname;
          if (clientPath === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }
        // Açık sekme yoksa yeni pencere aç
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

// ── Notification Close ────────────────────────────────────────────────────────
self.addEventListener('notificationclose', (event) => {
  console.log(`[SW ${SW_VERSION}] Bildirim kapatıldı:`, event.notification.tag);
});

// ── Push Subscription Change ──────────────────────────────────────────────────
// Tarayıcı aboneliği otomatik yenilediğinde tetiklenir (Chrome 60+)
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe({
        userVisibleOnly: true,
        applicationServerKey: event.oldSubscription?.options?.applicationServerKey ?? null,
      })
      .then((newSub) => {
        // Yeni aboneliği React tarafına ilet → Supabase'e kaydedilsin
        return self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((client) =>
            client.postMessage({
              type: 'SW_SUBSCRIPTION_RENEWED',
              subscription: newSub.toJSON(),
            })
          );
        });
      })
      .catch((err) => {
        console.error(`[SW ${SW_VERSION}] Abonelik yenilenemedi:`, err);
      })
  );
});
