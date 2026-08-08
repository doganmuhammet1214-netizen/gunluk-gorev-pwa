// ─────────────────────────────────────────────────────────────────────────────
// firebase-messaging-sw.js
// Firebase Cloud Messaging (FCM) Background Service Worker
//
// Bu dosya PUBLIC klasöründe olmalıdır — Vite bundle etmez, olduğu gibi serve eder.
// Uygulama arka planda veya kapalıyken gelen FCM push mesajlarını yakalar.
// ─────────────────────────────────────────────────────────────────────────────

importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

// ─── Firebase Konfigürasyonu ──────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            'AIzaSyBh7HPxLVWQ-a2LbPWVHP0lku-CjJBcCcM',
  authDomain:        'gunluk-gorev.firebaseapp.com',
  projectId:         'gunluk-gorev',
  storageBucket:     'gunluk-gorev.firebasestorage.app',
  messagingSenderId: '38032682936',
  appId:             '1:38032682936:web:43ea47833602f9f8dae94d',
};

// ─── Firebase App & Messaging ─────────────────────────────────────────────────
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// ─── Background Push Handler ──────────────────────────────────────────────────
/**
 * Uygulama arka planda veya kapalıyken FCM mesajı geldiğinde tetiklenir.
 *
 * ⚠️ ÖNEMLİ (ÇİFT BİLDİRİM ÖNLEME):
 * FCM SDK, gelen payload içerisinde `payload.notification` alanı varsa
 * bildirimi arka planda OTOMATİK olarak görüntüler.
 *
 * Eğer `messaging.onBackgroundMessage` içinde tekrar `showNotification`
 * çağrılırsa tarayıcı ekrana 2 adet bildirim çıkarır!
 * Bu nedenle yalnızca `data-only` (notification alanı olmayan) mesajlarda
 * manuel showNotification çağırıyoruz.
 */
messaging.onBackgroundMessage((payload) => {
  console.log('[FCM SW] Message received:', payload);

  // Eğer payload.notification varsa, Firebase SDK bildirimi zaten kendi otomatik basmıştır.
  // Çift bildirimi önlemek için manuel showNotification'ı ATLA.
  if (payload.notification) {
    console.log('[FCM SW] Bildirim Firebase SDK tarafından otomatik gösteriliyor.');
    return;
  }

  // Yalnızca "data-only" mesaj gelirse manuel bildirim göster
  const APP_NAME   = 'FlowDay';
  const notifTitle = payload.data?.title ?? APP_NAME;
  const notifBody  = payload.data?.body  ?? 'Yeni bir bildiriminiz var.';
  const notifIcon  = payload.data?.icon  ?? '/icons/icon-192.png';
  const notifBadge = payload.data?.badge ?? '/icons/icon-192.png';
  const targetUrl  = payload.data?.url   ?? '/';
  const taskId     = payload.data?.taskId ?? '';
  const priority   = payload.data?.priority ?? 'normal';

  const tag = taskId ? `task-${taskId}` : 'flowday-fcm';

  const notifOptions = {
    body:               notifBody,
    icon:               notifIcon,
    badge:              notifBadge,
    tag:                tag, // Tag vererek işletim sisteminde tekilleştir
    data:               { url: targetUrl, taskId, priority },
    requireInteraction: priority === 'high',
    vibrate:            [200, 100, 200],
    actions: [
      { action: 'open',    title: '📋 Görevi Aç' },
      { action: 'dismiss', title: 'Kapat'         },
    ],
  };

  return self.registration.showNotification(notifTitle, notifOptions);
});

// ─── Notification Click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url ?? '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          const clientPath = new URL(client.url).pathname;
          if (clientPath === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
