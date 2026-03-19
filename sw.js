/**
 * Service Worker — Medstand PWA
 * Cache-first strategy cho static assets, network-first cho API calls.
 * Khi deploy phiên bản mới: tăng CACHE_VERSION → SW mới sẽ xóa cache cũ.
 */

const CACHE_VERSION = 'medstand-v3';

// Danh sách tài nguyên cần cache ngay khi install (SPA mode)
const PRECACHE_URLS = [
  '/',
  '/index.html',

  // Standalone auth pages
  '/login.html',
  '/register.html',
  '/forgot-password.html',

  // Templates (loaded by router)
  '/src/templates/home.html',
  '/src/templates/routes.html',
  '/src/templates/orders.html',
  '/src/templates/account.html',

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
  '/src/js/config/api.config.js',
  '/src/js/services/http.js',
  '/src/js/services/auth.service.js',
  '/src/js/components/NavBar.js',

  // Offline fallback
  '/offline.html',
];

// ── Install: cache tất cả static assets ──────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      console.log('[SW] Pre-caching app shell');
      return cache.addAll(PRECACHE_URLS);
    })
  );
  // Kích hoạt SW mới ngay lập tức (không chờ tab cũ đóng)
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
  // Chiếm quyền điều khiển tất cả client ngay lập tức
  self.clients.claim();
});

// ── Fetch: cache-first cho static, network-first cho API ──────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Bỏ qua các request không phải GET
  if (request.method !== 'GET') return;

  // Nếu là API call → luôn lấy từ network
  if (request.url.includes('/api/')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Static assets → cache-first, offline fallback
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      // Nếu chưa có trong cache → fetch rồi lưu vào cache
      return fetch(request).then((networkResponse) => {
        // Chỉ cache response hợp lệ
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === 'basic'
        ) {
          const clone = networkResponse.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => {
        // Mất mạng + không có cache → trả về offline page cho navigation requests
        if (request.mode === 'navigate' || request.headers.get('accept').includes('text/html')) {
          return caches.match('/offline.html');
        }
      });
    })
  );
});
