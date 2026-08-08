(function () {
  'use strict';

  var STORAGE_KEY = 'medstand_chat_order_created_notice_v1';
  var ORIGIN_KEY = 'medstand_chat_order_origin_v1';
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

  function rememberChatOrderOrigin() {
    if (!/#\/?create-order\?data=/.test(window.location.hash || '')) return;
    try {
      sessionStorage.setItem(ORIGIN_KEY, JSON.stringify({
        username: currentUsername(),
        createdAt: Date.now()
      }));
    } catch (e) {
      console.warn('[OrderResultBridge] Không thể ghi nhận nguồn tạo đơn từ chatbot.', e);
    }
  }

  function validChatOrderOrigin() {
    try {
      var raw = sessionStorage.getItem(ORIGIN_KEY);
      var origin = raw ? JSON.parse(raw) : null;
      return !!origin && Date.now() - Number(origin.createdAt || 0) <= MAX_AGE_MS;
    } catch (e) {
      return false;
    }
  }

  function queueFallbackNoticeFromAlert(text) {
    if (!validChatOrderOrigin()) return false;
    var match = String(text || '').match(/Mã đơn:\s*([A-Za-z0-9._\/-]+)/i);
    if (!match || !match[1]) return false;

    try {
      var existing = readNotice();
      if (!existing || String(existing.documentId || '') !== match[1]) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
          documentId: match[1],
          username: currentUsername(),
          createdAt: Date.now()
        }));
      }
      sessionStorage.removeItem(ORIGIN_KEY);
      return true;
    } catch (e) {
      console.warn('[OrderResultBridge] Không thể lưu kết quả tạo đơn từ UI.', e);
      return false;
    }
  }

  function installSuccessHook() {
    if (typeof Alert === 'undefined' || !Alert || typeof Alert.success !== 'function') return false;
    if (Alert.__orderResultBridgeWrapped) return true;

    var originalSuccess = Alert.success.bind(Alert);
    Alert.success = function (text, title) {
      var alertResult = originalSuccess(text, title);
      if (/#\/?create-order(?:[?]|$)/.test(window.location.hash || '')
        && queueFallbackNoticeFromAlert(text)) {
        var returnToChat = function () {
          if (/#\/?create-order(?:[?]|$)/.test(window.location.hash || '')) {
            if (typeof navigate === 'function') navigate('chatbot');
            else window.location.hash = '#/chatbot';
          }
        };
        Promise.resolve(alertResult).then(returnToChat, returnToChat);
      }
      return alertResult;
    };
    Alert.__orderResultBridgeWrapped = true;
    return true;
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

  function handleRouteChange() {
    rememberChatOrderOrigin();
    installSuccessHook();
    scheduleDelivery();
  }

  window.addEventListener('hashchange', handleRouteChange);
  new MutationObserver(function (mutations) {
    var chatbotAdded = mutations.some(function (mutation) {
      return Array.prototype.some.call(mutation.addedNodes || [], function (node) {
        return node.nodeType === 1
          && ((node.matches && node.matches('.chatbot-page'))
            || (node.querySelector && node.querySelector('.chatbot-page')));
      });
    });
    if (chatbotAdded) handleRouteChange();
  }).observe(document.documentElement, { childList: true, subtree: true });

  handleRouteChange();
})();
