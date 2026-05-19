/**
 * AuthService — đăng nhập, đăng xuất, cập nhật Firebase token
 *
 * Token được lưu vào cookie `auth_token` (7 ngày) thay vì localStorage.
 * Hàm cookie hỗ trợ có thể dùng trên mọi trang.
 */
const AuthService = (() => {
  const EP = API_CONFIG.ENDPOINTS.AUTH;

  // ── Cookie helpers ──────────────────────────────────────────────────────
  function setCookie(name, value, days) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    const isSecure = window.location.protocol === 'https:';
    // SameSite=Strict và Secure (nếu là HTTPS) để bảo mật cao hơn
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Strict${isSecure ? ';Secure' : ''}`;
  }

  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : '';
  }

  function deleteCookie(name) {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Đăng nhập
   * POST { username, password }
   * Server trả { code:0, msg, access_token, refresh_token, UserName, DisplayName, ... }
   * code === 0 là thành công
   */
  async function login(username, password) {
    console.log('[Auth] login attempt:', username);
    try {
      const data = await Http.post(EP.LOGIN, { username, password });
      console.log('[Auth] login response:', data);

      if (!data) throw new Error('Không nhận được phản hồi từ server');

      // Server trả code 0 = thành công
      if (data.code !== 0) {
        const msg = data.msg || 'Tên đăng nhập hoặc mật khẩu không đúng';
        console.error('[Auth] login rejected — code:', data.code, '| msg:', msg);
        throw new Error(msg);
      }

      // Lưu access_token vào cookie (7 ngày)
      const token = data.access_token || '';
      if (token) setCookie('auth_token', token, 7);

      // Gọi API lấy thông tin chi tiết người dùng
      try {
        const infoRes = await Http.post(EP.USER_INFO);
        if (infoRes && infoRes.code === 0 && infoRes.records && infoRes.records.length > 0) {
          const userInfo = infoRes.records[0];
          localStorage.setItem('auth_user', JSON.stringify(userInfo));
        } else {
          // Fallback nếu không lấy được info chi tiết
          localStorage.setItem('auth_user', JSON.stringify({
            UserName: data.UserName || username,
            DisplayName: data.DisplayName || username
          }));
        }
      } catch (infoErr) {
        console.error('[Auth] Failed to fetch user info:', infoErr);
        localStorage.setItem('auth_user', JSON.stringify({
          UserName: data.UserName || username,
          DisplayName: data.DisplayName || username
        }));
      }

      return data;
    } catch (e) {
      console.error('[Auth] login error:', e.message);
      throw e;
    }
  }

  /** Đăng xuất, xóa token */
  async function logout() {
    try {
      await Http.post(EP.LOGOUT);
    } finally {
      deleteCookie('auth_token');
      localStorage.removeItem('auth_user');
      localStorage.removeItem('survey_doc_id'); // Xóa để acc mới không bị lẫn bài cũ
      window.location.href = 'pages/login.html?v=' + Date.now();
    }
  }

  /**
   * Cập nhật Firebase token — gọi API_UsertokenFirebase
   * @param {string} tokenFirebase
   */
  function updateFirebaseToken(tokenFirebase) {
    const user = JSON.parse(localStorage.getItem('auth_user') || '{}');
    return Http.post(EP.UPDATE_FIREBASE_TOKEN, {
      User: user.username || '',
      tokenFirebase,
    });
  }

  /** Lấy token hiện tại (dùng cho Http._getToken override) */
  function getToken() {
    return getCookie('auth_token');
  }

  /**
   * Đồng bộ hiển thị thông tin người dùng lên giao diện
   * @param {string} nameSelector Selector cho element hiển thị tên
   * @param {string} avatarSelector Selector cho element hiển thị avatar
   */
  /**
   * Rút gọn tên — giữ tối đa 2 từ cuối
   * "Tài khoản test app" → "test app"
   */
  function truncateName(name, maxWords = 2) {
    if (!name) return '';
    const words = name.trim().split(/\s+/);
    return words.length <= maxWords ? name : words.slice(-maxWords).join(' ');
  }

  function syncUserDisplay(nameSelector, avatarSelector) {
    try {
      const user = JSON.parse(localStorage.getItem('auth_user') || '{}');
      if (user.DisplayName && nameSelector) {
        $(nameSelector).text(truncateName(user.DisplayName));
      }
      if (avatarSelector) {
        const $avatar = $(avatarSelector);
        if (user.Avatar) {
          const avatarSrc = user.Avatar.startsWith('data:')
            ? user.Avatar
            : `data:image/jpeg;base64,${user.Avatar}`;
          $avatar.attr('src', avatarSrc);
        } else if (user.DisplayName) {
          $avatar.attr('src', `https://ui-avatars.com/api/?name=${encodeURIComponent(user.DisplayName)}&background=${getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim().replace('#', '') || '3c50e0'}&color=fff`);
        }
      }
    } catch (e) {
      console.error('[Auth] Failed to sync user display:', e);
    }
  }

  return { login, logout, updateFirebaseToken, getToken, getCookie, setCookie, deleteCookie, syncUserDisplay };
})();
