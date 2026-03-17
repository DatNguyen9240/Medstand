// Forgot-password page script — extracted from forgot-password.html inline script
AuthThemeToggle.bind();
PasswordToggle.init();

// ── State ─────────────────────────────────────────────────────────────────
var _username = '';
var $error = $('#form-error');

function showError(msg) {
  $error.text(msg).show();
}
function clearError() {
  $error.hide().text('');
}

// ── Step 1: Nhập username → chuyển step 2 ────────────────────────────────
$('#btn-next').on('click', function () {
  clearError();
  var username = $('#username').val().trim();

  if (!username) {
    showError('Vui lòng nhập tên đăng nhập.');
    return;
  }

  _username = username;

  // Chuyển sang step 2
  $('#step-1').hide();
  $('#step-2').show();
  $('#dot-1').removeClass('active');
  $('#dot-2').addClass('active');
  $('#new-pw').focus();
});

// ── Step 2: Đặt lại mật khẩu ────────────────────────────────────────────
$('#btn-reset').on('click', function () {
  clearError();
  var newPw = $('#new-pw').val().trim();
  var confirmPw = $('#confirm-pw').val().trim();

  if (!newPw) { showError('Vui lòng nhập mật khẩu mới.'); return; }
  if (newPw.length < 6) { showError('Mật khẩu mới tối thiểu 6 ký tự.'); return; }
  if (newPw !== confirmPw) { showError('Xác nhận mật khẩu không khớp.'); return; }

  var $btn = $(this);
  $btn.prop('disabled', true);
  $('#reset-spinner').show();
  $('#btn-reset-text').text('Đang xử lý...');

  Http.post(API_CONFIG.ENDPOINTS.AUTH.CHANGE_PASSWORD, {
    UserName: _username,
    OldPassword: '',
    NewPassword: newPw
  }).then(function (res) {
    var data = res.data !== undefined ? res.data : res;
    var code = data.code !== undefined ? data.code : (data.Code !== undefined ? data.Code : -1);
    var msg = data.msg || data.Msg || '';

    if (code === 0) {
      Alert.success(msg || 'Đặt lại mật khẩu thành công! Đang chuyển đến đăng nhập...');
      setTimeout(function () {
        navigate('#/login');
      }, 2000);
    } else {
      showError(msg || 'Đặt lại mật khẩu thất bại.');
    }
  }).catch(function (err) {
    showError(err.message || 'Lỗi kết nối. Vui lòng thử lại.');
  }).finally(function () {
    $btn.prop('disabled', false);
    $('#reset-spinner').hide();
    $('#btn-reset-text').text('Đặt lại mật khẩu');
  });
});

// Enter key support
$('#username').on('keydown', function (e) {
  if (e.key === 'Enter') $('#btn-next').click();
});
$('#confirm-pw').on('keydown', function (e) {
  if (e.key === 'Enter') $('#btn-reset').click();
});
