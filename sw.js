/**
 * Service Worker — Medstand PWA
 * Cache-first strategy cho static assets, network-first cho API calls.
 * Khi deploy phiên bản mới: tăng CACHE_VERSION → SW mới sẽ xóa cache cũ.
 */

const CACHE_VERSION = 'medstand-11.139'; // Route all internal business requests through the gateway

// Danh sách tài nguyên cần cache ngay khi install (SPA mode)
const PRECACHE_URLS = [
  '/',

  // Standalone auth pages
  '/pages/login.html',
  '/pages/forgot-password.html',

  // Templates (loaded by router)
  '/src/templates/home.html',
  '/src/templates/routes.html',
  '/src/templates/orders.html',
  '/src/templates/account.html',

  // Chatbot Widget
  '/chatbot-widget/template/chatbot.html',
  '/chatbot-widget/template/ai-bot-button.html',
  '/chatbot-widget/js/chatbot.bundle.min.js',
  '/chatbot-widget/js/chatbot-core.bundle.min.js',
  '/chatbot-widget/css/chatbot.css',
  '/chatbot-widget/css/chatbot-api-engine.css',
  '/chatbot-widget/css/ai-bot-button.css',

  // Bundled Production Assets (Tải cực nhanh)
  '/src/css/dist/app.bundle.min.css',
  '/src/js/dist/app.bundle.min.js',
  '/src/js/dist/theme.min.js',

  // Assets
  '/images/logo/medstand-logo.png',
  '/images/logo/medstand-icon.png',
  '/src/pwa/manifest.json',
  '/src/pwa/pwa-register.js',

  // Offline fallback
  '/pages/offline.html',

  // Thư viện ngoài CDN (Cache cục bộ để tải tức thời trong 0ms)
  'https://cdnjs.cloudflare.com/ajax/libs/cash/8.1.5/cash.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
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

  // ── Dữ liệu nghiệp vụ: KHÔNG BAO GIỜ cache ───────────────────────────────
  // Cache của Service Worker dùng chung cho mọi tài khoản trên cùng trình duyệt.
  // Nếu cache response /api/ rồi trả lại khi mạng lỗi, tài khoản đăng nhập sau
  // có thể nhìn thấy dữ liệu của tài khoản trước — vi phạm phân quyền.
  // Luôn đi thẳng ra mạng và để lỗi nổi lên cho tầng ứng dụng xử lý.
  if (request.url.includes('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // `accept` có thể vắng mặt; `headers.get()` trả null và `.includes` sẽ ném.
  const acceptHeader = request.headers.get('accept') || '';

  if (request.url.includes('/chatbot-widget/') ||
    request.mode === 'navigate' ||
    acceptHeader.includes('text/html')) {
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
        if (request.mode === 'navigate' || acceptHeader.includes('text/html')) {
          return caches.match('/pages/offline.html');
        }
      });
    })
  );
});
