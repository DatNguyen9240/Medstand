/**
 * PWA — Service Worker Registration
 * Include file này ở cuối mỗi trang HTML.
 */

// Tự động dọn dẹp cache và Service Worker nếu có tham số clean=true trên URL
if (window.location.href.indexOf('clean=true') > -1) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
      for (var i = 0; i < registrations.length; i++) {
        registrations[i].unregister();
      }
    });
  }
  if ('caches' in window) {
    caches.keys().then(function (names) {
      for (var i = 0; i < names.length; i++) {
        caches.delete(names[i]);
      }
    });
  }
  
  // Xóa sạch localStorage liên quan đến cache cũ
  localStorage.removeItem('ai_chat_history');
  
  // Trở về URL sạch
  var cleanUrl = window.location.href.replace(/[?&]clean=true/g, '').replace(/clean=true/g, '');
  setTimeout(function () {
    window.location.href = cleanUrl;
  }, 300);
}

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
