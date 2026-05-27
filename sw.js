/**
 * Service Worker — Medstand PWA
 * Cache-first strategy cho static assets, network-first cho API calls.
 * Khi deploy phiên bản mới: tăng CACHE_VERSION → SW mới sẽ xóa cache cũ.
 */

const CACHE_VERSION = 'medstand-v31';

// Danh sách tài nguyên cần cache ngay khi install (SPA mode)
const PRECACHE_URLS = [
  '/',
  '/index.html',

  // Standalone auth pages
  '/pages/login.html',
  '/pages/register.html',
  '/pages/forgot-password.html',

  // Templates (loaded by router)
  '/src/templates/home.html',
  '/src/templates/routes.html',
  '/src/templates/orders.html',
  '/src/templates/account.html',

  // Chatbot Widget
  '/chatbot-widget/template/chatbot.html',
  '/chatbot-widget/template/ai-bot-button.html',
  '/chatbot-widget/js/chatbot-suggestions.js',
  '/chatbot-widget/js/chatbot-api-engine.js',
  '/chatbot-widget/js/chatbot.js',
  '/chatbot-widget/css/chatbot.css',
  '/chatbot-widget/css/chatbot-api-engine.css',
  '/chatbot-widget/css/ai-bot-button.css',

  // Global CSS
  '/src/css/design-tokens.css',
  '/src/css/global.css',
  '/src/css/components/header.css',
  '/src/css/components/card.css',
  '/src/css/components/nav-bar.css',
  '/src/css/components/list.css',
  '/src/css/components/chart.css',
  '/src/css/components/skeleton.css',
  '/src/css/components/loading-spinner.css',
  '/src/css/layouts/desktop.css',

  // Assets
  '/images/logo/medstand-logo.png',
  '/src/pwa/manifest.json',
  '/src/pwa/pwa-register.js',

  // Core JS
  '/src/js/core/router.js',
  '/env.js',
  '/src/js/services/http.js',
  '/src/js/services/auth.service.js',
  '/src/js/components/NavBar.js',

  // Offline fallback
  '/pages/offline.html',
];

// ── Install: cache từng file riêng, bỏ qua file lỗi ──────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      console.log('[SW] Pre-caching app shell');
      return Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Skip cache (not found):', url, err.message);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

// ── Activate: xóa cache phiên bản cũ ─────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_VERSION)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: cache-first cho static, network-first cho API ──────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.url.includes(':5678')) return;

  if (request.url.includes('/api/') ||
    request.url.includes('/chatbot-widget/') ||
    request.mode === 'navigate' ||
    request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const clone = networkResponse.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => {
        if (request.mode === 'navigate' || request.headers.get('accept').includes('text/html')) {
          return caches.match('/pages/offline.html');
        }
      });
    })
  );
});
