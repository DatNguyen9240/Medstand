/**
 * AuthService — đăng nhập, đăng xuất, cập nhật Firebase token
 *
 * Token được lưu vào cookie `auth_token` (7 ngày) thay vì localStorage.
 * Hàm cookie hỗ trợ có thể dùng trên mọi trang.
 */
const AuthService = (() => {
  const EP = API_CONFIG.ENDPOINTS.AUTH;
  let isLoggingOut = false;

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
    var expired = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;Max-Age=0;SameSite=Strict;path=';
    document.cookie = expired + '/';
    document.cookie = expired + '/pages';
    document.cookie = expired + (window.location.pathname.replace(/\/[^/]*$/, '') || '/');
    document.cookie = expired + '/;domain=' + window.location.hostname;
  }

  function clearChatHistory() {
    try {
      Object.keys(localStorage).forEach(function (key) {
        if (/^ai_chat_history(?:_v2)?(?:_|$)/.test(key)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.warn('[Auth] Không thể xóa lịch sử chat trong localStorage:', error);
    }

    // Chatbot mới lưu lịch sử theo từng tài khoản trong IndexedDB. Khi đăng
    // xuất phải xóa dữ liệu này để tài khoản kế tiếp trên cùng máy không đọc
    // lại hội thoại cũ.
    try {
      if (window.indexedDB) indexedDB.deleteDatabase('MedstandChatDB');
    } catch (error) {
      console.warn('[Auth] Không thể xóa lịch sử chat trong IndexedDB:', error);
    }
  }

  function mergeIdentityFields(userInfo, loginData) {
    var merged = Object.assign({}, userInfo || {});
    var fields = [
      'RoleName', 'UserRoleName', 'GroupName', 'UserGroupName',
      'UserGroupID', 'UserGroup', 'Manager', 'IsManager',
      'manager', 'isManager', 'EmployeeID', 'ManagerID', 'BranchID'
    ];
    fields.forEach(function (field) {
      if ((merged[field] === undefined || merged[field] === null || merged[field] === '') &&
          loginData && loginData[field] !== undefined) {
        merged[field] = loginData[field];
      }
    });
    // Chuẩn hóa hồ sơ để các màn hình dùng cùng một hợp đồng quyền hạn.
    // Đây chỉ là metadata phía UI; API/SQL vẫn là lớp kiểm soát quyền cuối.
    var roleText = String(merged.RoleName || merged.UserRoleName || merged.GroupName || merged.UserGroupName || '').trim();
    var groupText = String(merged.UserGroupID || merged.UserGroup || '').trim();
    var managerFlag = Number(merged.Manager !== undefined ? merged.Manager : (merged.IsManager !== undefined ? merged.IsManager : 0)) === 1;
    var isAdmin = /admin|quản trị|quan tri/i.test(roleText + ' ' + groupText);
    merged.roleCode = merged.roleCode || merged.RoleCode || (isAdmin ? 'ADMIN' : (managerFlag ? 'MANAGER' : 'TDV'));
    merged.roleName = merged.roleName || roleText || (isAdmin ? 'Quản trị viên' : (managerFlag ? 'Quản lý' : 'Trình dược viên'));
    merged.employeeId = merged.employeeId || merged.EmployeeID || '';
    merged.managerId = merged.managerId || merged.ManagerID || '';
    merged.branchId = merged.branchId || merged.BranchID || '';
    return merged;
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
          const userInfo = mergeIdentityFields(infoRes.records[0], data);
          localStorage.setItem('auth_user', JSON.stringify(userInfo));
        } else {
          // Fallback nếu không lấy được info chi tiết
          localStorage.setItem('auth_user', JSON.stringify(mergeIdentityFields({
            UserName: data.UserName || username,
            DisplayName: data.DisplayName || username
          }, data)));
        }
      } catch (infoErr) {
        console.error('[Auth] Failed to fetch user info:', infoErr);
        localStorage.setItem('auth_user', JSON.stringify(mergeIdentityFields({
          UserName: data.UserName || username,
          DisplayName: data.DisplayName || username
        }, data)));
      }

      return data;
    } catch (e) {
      console.error('[Auth] login error:', e.message);
      throw e;
    }
  }

  /** Đăng xuất, xóa token */
  async function logout() {
    if (isLoggingOut) return;
    isLoggingOut = true;
    window.__isLoggingOut = true;
    $('.sidebar-logout-btn').prop('disabled', true);
    // Server còn giữ cookie phiên HttpOnly, vì vậy cần gọi logout trước. Timeout bảo đảm
    // gateway chậm không khóa nút đăng xuất vô thời hạn.
    try {
      await Promise.race([
        Http.post(EP.LOGOUT),
        new Promise(function (resolve) { setTimeout(resolve, 3000); })
      ]);
    } catch (error) {
      console.warn('[Auth] Server logout failed:', error);
    } finally {
      deleteCookie('auth_token');
      clearChatHistory();
      localStorage.removeItem('auth_user');
      localStorage.removeItem('survey_doc_id');
      if (typeof Http !== 'undefined' && Http.clearCache) Http.clearCache();
      sessionStorage.clear();
      if (window.Swal) Swal.close();
      $('.picker-overlay, .picker-sheet, .filter-overlay, .filter-modal, .select-modal').remove();
      $('body').css('overflow', '').removeClass('has-total-bar');
      window.location.replace(window.location.origin + '/pages/login.html?v=' + Date.now());
    }
  }

  /**
   * Cập nhật Firebase token — gọi API_UsertokenFirebase
   * @param {string} tokenFirebase
   */
  /** Validate the saved session with the server when the app opens. */
  async function validateSession() {
    const hasLocalIdentity = !!localStorage.getItem('auth_user');
    const token = getCookie('auth_token');
    if (!token && !hasLocalIdentity) return false;

    try {
      const result = await Http.post(EP.USER_INFO);
      if (result && result.code === 0) {
        if (result.records && result.records.length > 0) {
          const current = JSON.parse(localStorage.getItem('auth_user') || '{}');
          localStorage.setItem('auth_user', JSON.stringify(mergeIdentityFields(result.records[0], current)));
        }
        return true;
      }
      return false;
    } catch (error) {
      // Http handles confirmed 401/code 2 responses. A temporary network error
      // must not destroy a session that may still be valid.
      console.warn('[Auth] Session validation could not be completed:', error.message);
      return hasLocalIdentity || !!token;
    }
  }
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

  return { login, logout, validateSession, updateFirebaseToken, getToken, getCookie, setCookie, deleteCookie, syncUserDisplay };
})();
