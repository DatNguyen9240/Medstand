// Register page script — extracted from register.html inline script
AuthThemeToggle.bind();
PasswordToggle.init();

// ── Password strength ─────────────────────────────────────────────────────
document.getElementById('password').addEventListener('input', function () {
  const v = this.value;
  const fill = document.getElementById('pw-fill');
  const label = document.getElementById('pw-label');
  let score = 0;
  if (v.length >= 8) score++;
  if (/[A-Z]/.test(v)) score++;
  if (/[0-9]/.test(v)) score++;
  if (/[^A-Za-z0-9]/.test(v)) score++;

  const levels = [
    { pct: '0%', color: '', text: '' },
    { pct: '25%', color: '#ef4444', text: 'Yếu' },
    { pct: '50%', color: '#f59e0b', text: 'Trung bình' },
    { pct: '75%', color: '#3b82f6', text: 'Khá mạnh' },
    { pct: '100%', color: '#10b981', text: 'Mạnh' },
  ];
  const l = levels[score];
  fill.style.width = v.length ? l.pct : '0%';
  fill.style.background = l.color;
  label.textContent = v.length ? l.text : '';
  label.style.color = l.color;
});

// ── Validate helpers ──────────────────────────────────────────────────────
function showErr(id, show) {
  document.getElementById(id).style.display = show ? 'block' : 'none';
}

// ── Register submit ───────────────────────────────────────────────────────
document.getElementById('register-form').addEventListener('submit', async function (e) {
  e.preventDefault();

  const firstName = document.getElementById('first-name').value.trim();
  const lastName = document.getElementById('last-name').value.trim();
  const username = document.getElementById('username').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const password = document.getElementById('password').value;
  const confirmPw = document.getElementById('confirm-password').value;
  const terms = document.getElementById('terms').checked;
  const errorEl = document.getElementById('reg-error');
  const successEl = document.getElementById('reg-success');

  // Reset
  errorEl.style.display = 'none';
  successEl.style.display = 'none';
  ['err-first-name', 'err-last-name', 'err-username', 'err-email', 'err-password', 'err-confirm']
    .forEach(id => showErr(id, false));

  // Validate
  let valid = true;
  if (!firstName) { showErr('err-first-name', true); valid = false; }
  if (!lastName) { showErr('err-last-name', true); valid = false; }
  if (username.length < 4) { showErr('err-username', true); valid = false; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showErr('err-email', true); valid = false; }
  if (password.length < 8) { showErr('err-password', true); valid = false; }
  if (password !== confirmPw) { showErr('err-confirm', true); valid = false; }
  if (!terms) {
    errorEl.textContent = 'Bạn cần đồng ý với điều khoản sử dụng.';
    errorEl.style.display = 'block';
    valid = false;
  }
  if (!valid) return;

  // Loading
  const btn = document.getElementById('btn-register');
  const spinner = document.getElementById('reg-spinner');
  const btnText = document.getElementById('btn-reg-text');
  btn.disabled = true;
  spinner.style.display = '';
  btnText.textContent = 'Đang đăng ký...';

  try {
    const displayName = (firstName + ' ' + lastName).trim();
    const res = await Http.post(API_CONFIG.ENDPOINTS.AUTH.REGISTER, {
      UserName: username,
      DisplayName: displayName,
      Password: password
    });
    // SP trả { Msg, MsgType } — MsgType=1 là lỗi, 5 là thành công
    const data = res.data || res;
    const record = Array.isArray(data) ? data[0] : (data.records ? data.records[0] : data);
    const msg = record && record.Msg ? record.Msg : '';
    const msgType = record && record.MsgType !== undefined ? record.MsgType : 5;
    if (msgType == 1) {
      errorEl.textContent = msg || 'Đăng ký thất bại. Vui lòng thử lại.';
      errorEl.style.display = 'block';
      return;
    }
    successEl.textContent = (msg || 'Đăng ký thành công!') + ' Đang chuyển đến trang đăng nhập...';
    successEl.style.display = 'block';
    setTimeout(() => navigate('#/login'), 2000);
  } catch (err) {
    errorEl.textContent = err.message || 'Đăng ký thất bại. Vui lòng thử lại.';
    errorEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    spinner.style.display = 'none';
    btnText.textContent = 'Đăng ký';
  }
});
