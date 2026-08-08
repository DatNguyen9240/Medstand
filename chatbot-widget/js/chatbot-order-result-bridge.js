(function () {
  'use strict';

  var STORAGE_KEY = 'medstand_chat_order_created_notice_v1';
  var MAX_AGE_MS = 60 * 60 * 1000;
  var retryTimer = null;
  var retryCount = 0;
  var delivering = false;

  function currentUsername() {
    try {
      var user = JSON.parse(localStorage.getItem('auth_user') || localStorage.getItem('currentUser') || '{}');
      return String(user.UserName || user.Username || user.username || '');
    } catch (e) {
      return '';
    }
  }

  function readNotice() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  function safeMarkdown(value) {
    return String(value == null ? '' : value).replace(/([\\`*_{}\[\]()<>#+.!|~-])/g, '\\$1');
  }

  function buildMessage(notice) {
    var lines = [
      '✅ Đã lên đơn thành công.',
      '',
      '- Mã đơn: **' + safeMarkdown(notice.documentId) + '**'
    ];
    if (notice.customerName) {
      lines.push('- Khách hàng: **' + safeMarkdown(notice.customerName) + '**');
    }
    if (Number(notice.itemCount) > 0) {
      lines.push('- Số dòng sản phẩm: **' + Number(notice.itemCount) + '**');
    }
    lines.push('', 'Anh/chị có thể tra cứu đơn hàng bằng mã trên.');
    return lines.join('\n');
  }

  function isChatbotRoute() {
    return /#\/?chatbot(?:[?#]|$)/.test(window.location.hash || '')
      && !!document.querySelector('.chatbot-page');
  }

  function deliverNotice() {
    if (delivering || !isChatbotRoute()) return false;

    var notice = readNotice();
    if (!notice) return true;
    if (!notice.documentId || Date.now() - Number(notice.createdAt || 0) > MAX_AGE_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return true;
    }

    var username = currentUsername();
    if (notice.username && username && String(notice.username).toLowerCase() !== username.toLowerCase()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return true;
    }

    var addMessage = window.ApiChatbot
      && window.ApiChatbot.__internal
      && window.ApiChatbot.__internal.addMessage;
    if (typeof addMessage !== 'function') return false;

    delivering = true;
    try {
      addMessage('ai', buildMessage(notice), null, true);
      sessionStorage.removeItem(STORAGE_KEY);
      return true;
    } catch (e) {
      console.warn('[OrderResultBridge] Không thể hiển thông báo tạo đơn trong chat.', e);
      return false;
    } finally {
      delivering = false;
    }
  }

  function scheduleDelivery() {
    clearInterval(retryTimer);
    retryCount = 0;
    if (deliverNotice()) return;
    retryTimer = setInterval(function () {
      retryCount += 1;
      if (deliverNotice() || retryCount >= 100) {
        clearInterval(retryTimer);
        retryTimer = null;
      }
    }, 100);
  }

  window.addEventListener('hashchange', scheduleDelivery);
  new MutationObserver(function (mutations) {
    var chatbotAdded = mutations.some(function (mutation) {
      return Array.prototype.some.call(mutation.addedNodes || [], function (node) {
        return node.nodeType === 1
          && ((node.matches && node.matches('.chatbot-page'))
            || (node.querySelector && node.querySelector('.chatbot-page')));
      });
    });
    if (chatbotAdded) scheduleDelivery();
  }).observe(document.documentElement, { childList: true, subtree: true });

  scheduleDelivery();
})();
