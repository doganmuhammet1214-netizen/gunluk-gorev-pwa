import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // generateSW: Workbox otomatik SW üretir — manifest çakışması olmaz
      strategies: 'generateSW',
      // Üretimde SW'yi otomatik güncelle
      registerType: 'autoUpdate',
      // Dev modunda da SW'yi etkinleştir (push test için)
      devOptions: {
        enabled: true,
        type: 'module',
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        name: 'FlowDay',
        short_name: 'FlowDay',
        description: 'FlowDay - Kişisel Görev ve Günlük Planlayıcı',
        theme_color: '#0f172a',
        background_color: '#020617',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // firebase-messaging-sw.js Workbox tarafından precache edilmemeli
        // (FCM kendi SW lifecycle'ını yönetir)
        globIgnores: ['firebase-messaging-sw.js'],
        // Push bildirimi + notificationclick kodunu üretilen SW'ye dahil et
        importScripts: ['/sw.js'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    open: true,
  },
});
