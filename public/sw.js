// ─────────────────────────────────────────────────────────────────────────────
// sw.js — Günlük Görev PWA Service Worker
// Arka planda push bildirimleri alır ve bildirim tıklamalarını yönetir.
// ─────────────────────────────────────────────────────────────────────────────

const SW_VERSION = '1.0.0';
const APP_NAME   = 'Günlük Görev';

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log(`[SW ${SW_VERSION}] Install`);
  // Yeni SW hemen aktif olsun; bekleme yok
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log(`[SW ${SW_VERSION}] Activate`);
  // Tüm mevcut sekmelerin kontrolünü hemen devral
  event.waitUntil(self.clients.claim());
});

// ── Push ─────────────────────────────────────────────────────────────────────
/**
 * Sunucu tarafından gönderilen push olayını yakalar.
 * Beklenen payload (JSON):
 * {
 *   "title":   "Görev hatırlatıcısı",
 *   "body":    "\"Rapor hazırla\" görevini tamamlamayı unutma!",
 *   "icon":    "/icons/icon-192.png",   // opsiyonel
 *   "badge":   "/icons/icon-192.png",  // opsiyonel
 *   "tag":     "task-reminder",         // opsiyonel — aynı tag varsa üstüne yazar
 *   "data": {
 *     "url":    "/",                    // tıklandığında açılacak URL
 *     "taskId": "abc-123"              // opsiyonel
 *   }
 * }
 */
self.addEventListener('push', (event) => {
  console.log('[SW] Push olayı alındı');

  let payload = {
    title: APP_NAME,
    body:  'Yeni bir bildiriminiz var.',
    icon:  '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag:   'gunluk-gorev-push',
    data:  { url: '/' },
  };

  // Sunucudan gelen JSON payload'ı ayrıştır
  if (event.data) {
    try {
      const incoming = event.data.json();
      payload = { ...payload, ...incoming };
    } catch {
      // JSON değil ise metin olarak kullan
      payload.body = event.data.text();
    }
  }

  const notificationOptions = {
    body:    payload.body,
    icon:    payload.icon,
    badge:   payload.badge,
    tag:     payload.tag,
    data:    payload.data,
    // Bildirim kalıcı kalsın (Android'de vibrasyon + ses)
    requireInteraction: false,
    // Kullanıcı odakta olmasa da göster
    silent: false,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, notificationOptions)
  );
});

// ── Notification Click ────────────────────────────────────────────────────────
/**
 * Kullanıcı bildirime tıkladığında çalışır.
 * Açık sekme varsa ona odaklanır; yoksa yeni sekme açar.
 */
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Bildirime tıklandı:', event.notification.tag);

  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Zaten açık bir sekme var mı?
        for (const client of clientList) {
          const clientUrl = new URL(client.url);
          if (clientUrl.pathname === targetUrl && 'focus' in client) {
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
// Kullanıcı bildirimi kapatırsa (isteğe bağlı analitik için)
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Bildirim kapatıldı:', event.notification.tag);
});

// ── Push Subscription Change ──────────────────────────────────────────────────
// Tarayıcı aboneliği otomatik yenilediğinde tetiklenir (Chrome 60+)
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[SW] Push aboneliği değişti, yenileniyor...');

  event.waitUntil(
    self.registration.pushManager
      .subscribe({
        userVisibleOnly: true,
        // applicationServerKey vite.config.ts / useNotifications'taki ile aynı olmalı
        applicationServerKey: event.oldSubscription
          ? event.oldSubscription.options.applicationServerKey
          : null,
      })
      .then((newSubscription) => {
        // Yeni aboneliği uygulamaya ilet
        return self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: 'PUSH_SUBSCRIPTION_RENEWED',
              subscription: newSubscription.toJSON(),
            });
          });
        });
      })
      .catch((err) => {
        console.error('[SW] Abonelik yenilenemedi:', err);
      })
  );
});
