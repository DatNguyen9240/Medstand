/**
 * PWA — Service Worker Registration
 * Include file này ở cuối mỗi trang HTML.
 */
if ('serviceWorker' in navigator) {
  // Bỏ qua Service Worker trên localhost để Live Server chạy nhanh và không bị cache
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  if (!isLocalhost) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('[PWA] Service Worker registered, scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
    });
  } else {
    console.log('[PWA] Service Worker bypassed on localhost for fast loading.');
  }
}
