// Login page script — extracted from login.html inline script
AuthThemeToggle.bind();
PasswordToggle.init();

// ── Login form ────────────────────────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async function (e) {
  e.preventDefault();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('login-error');
  const spinner = document.getElementById('login-spinner');
  const btnText = document.getElementById('btn-login-text');
  const btn = document.getElementById('btn-login');

  // Reset lỗi
  errorEl.style.display = 'none';

  if (!username || !password) {
    errorEl.textContent = 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.';
    errorEl.style.display = 'block';
    return;
  }

  // Loading state
  btn.disabled = true;
  spinner.style.display = '';
  btnText.textContent = 'Đang đăng nhập...';

  try {
    await AuthService.login(username, password);

    // Ghi nhớ đăng nhập
    if (document.getElementById('remember-me').checked) {
      localStorage.setItem('remember_user', username);
    }

    // Redirect trang chủ
    navigate('#/home');
  } catch (err) {
    errorEl.textContent = err.message || 'Đăng nhập thất bại. Vui lòng thử lại.';
    errorEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    spinner.style.display = 'none';
    btnText.textContent = 'Đăng nhập';
  }
});

// ── Điền lại user đã ghi nhớ ─────────────────────────────────────────────
const remembered = localStorage.getItem('remember_user');
if (remembered) {
  document.getElementById('username').value = remembered;
  document.getElementById('remember-me').checked = true;
}
