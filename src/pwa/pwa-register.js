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
  
  // Chế độ dọn thủ công: xóa cả các định dạng lịch sử chat cũ và mới.
  Object.keys(localStorage).forEach(function (key) {
    if (/^ai_chat_history(?:_v2)?(?:_|$)/.test(key)) {
      localStorage.removeItem(key);
    }
  });
  if (window.indexedDB) indexedDB.deleteDatabase('MedstandChatDB');
  
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
        .register('/sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          console.log('[PWA] Service Worker registered, scope:', reg.scope);
          reg.update().catch(() => {});
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
    });
  } else {
    console.log('[PWA] Service Worker bypassed on localhost for fast loading.');
  }
}
