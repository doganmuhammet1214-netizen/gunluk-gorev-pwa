// ─────────────────────────────────────────────────────────────────────────────
// firebase-messaging-sw.js
// Firebase Cloud Messaging (FCM) Background Service Worker
//
// Bu dosya PUBLIC klasöründe olmalıdır — Vite bundle etmez, olduğu gibi serve eder.
// Uygulama arka planda veya kapalıyken gelen FCM push mesajlarını yakalar.
//
// ⚠️ importScripts ile Firebase compat sürümü kullanılır (ESM desteklenmez).
// ─────────────────────────────────────────────────────────────────────────────

importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

// ─── Firebase Konfigürasyonu ──────────────────────────────────────────────────
// ⚠️ Bu değerler public SW'de düz metin olarak yer almak zorunda.
//    VITE env değişkenleri SW'de import.meta.env ile okunamaz.
//    Firebase Web API Key'leri zaten public key niteliğindedir (gizli değil).
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
 * Firebase bu olayı otomatik yakalar ve showNotification'ı çağırır.
 *
 * Beklenen FCM payload yapısı (notification alanı veya data alanı):
 * {
 *   notification: { title, body, icon },
 *   data: { url, taskId, priority }
 * }
 */
messaging.onBackgroundMessage((payload) => {
  // ── DEBUG LOG: Bu satır konsolda görünüyorsa FCM SW çalışıyor demektir ──
  console.log('[FCM SW] ✅ Bildirim alındı! Payload:', JSON.stringify(payload, null, 2));
  console.log('[FCM SW] Bildirim tipi:', payload.notification ? 'notification' : 'data-only');
  console.log('[FCM SW] Data alanı:', payload.data);

  const APP_NAME = 'FlowDay';

  // Notification alanından veya data alanından başlık/içerik al
  const notifTitle  = payload.notification?.title  ?? payload.data?.title  ?? APP_NAME;
  const notifBody   = payload.notification?.body   ?? payload.data?.body   ?? 'Yeni bir hatırlatıcınız var.';
  const notifIcon   = payload.notification?.icon   ?? payload.data?.icon   ?? '/icons/icon-192.png';
  const notifBadge  = payload.data?.badge  ?? '/icons/icon-192.png';
  const targetUrl   = payload.data?.url    ?? '/';
  const taskId      = payload.data?.taskId ?? '';
  const priority    = payload.data?.priority ?? 'normal';

  // Priority badge rengi için tag
  const tag = taskId ? `task-${taskId}` : 'flowday-fcm';

  const notifOptions = {
    body:               notifBody,
    icon:               notifIcon,
    badge:              notifBadge,
    tag,
    data:               { url: targetUrl, taskId, priority },
    requireInteraction: priority === 'high',   // Yüksek öncelikli görevler kapatılmaz
    silent:             false,
    vibrate:            [200, 100, 200],
    // Android: Bildirim aksiyonları
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

  // Aksiyon kontrolü
  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url ?? '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Zaten açık bir sekme varsa odaklan
        for (const client of clientList) {
          const clientPath = new URL(client.url).pathname;
          if (clientPath === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }
        // Yoksa yeni sekme aç
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

// ─── Install / Activate ───────────────────────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
