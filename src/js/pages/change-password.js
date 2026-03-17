    $('#sidebar-container').html(renderSidebar('account', ''));
    $('#nav-container').html(renderNavBar('account', ''));

    (function () {
      // Toggle show/hide password – SVG eye swap
      $('.btn-toggle-pw').on('click', function () {
        var targetId = $(this).data('target');
        var $input = $('#' + targetId);
        var isPassword = $input.attr('type') === 'password';
        $input.attr('type', isPassword ? 'text' : 'password');
        $(this).find('.eye-open').css('display', isPassword ? 'none' : 'block');
        $(this).find('.eye-off').css('display', isPassword ? 'block' : 'none');
      });

      $('#btn-update').on('click', function () {
        var currentPw = $('#current-pw').val().trim();
        var newPw = $('#new-pw').val().trim();
        var confirmPw = $('#confirm-pw').val().trim();
        var $msg = $('#pw-msg');

        $msg.text('').removeClass('pw-success').addClass('pw-error');

        // Validate
        if (!currentPw) { $msg.text('Vui lòng nhập mật khẩu hiện tại'); return; }
        if (!newPw) { $msg.text('Vui lòng nhập mật khẩu mới'); return; }
        if (newPw.length < 6) { $msg.text('Mật khẩu mới tối thiểu 6 ký tự'); return; }
        if (newPw !== confirmPw) { $msg.text('Xác nhận mật khẩu không khớp'); return; }

        ConfirmModal.show({
          title: 'Đổi mật khẩu',
          message: 'Bạn có chắc chắn muốn đổi mật khẩu?',
          icon: '🔐',
          okText: 'Xác nhận',
          cancelText: 'Hủy',
          onOk: function () {
            var $btn = $('#btn-update');
            $btn.prop('disabled', true).text('Đang xử lý...');

            var authUser = JSON.parse(localStorage.getItem('auth_user') || '{}');

            Http.post(API_CONFIG.ENDPOINTS.AUTH.CHANGE_PASSWORD, {
              UserName: authUser.UserName || '',
              OldPassword: currentPw,
              NewPassword: newPw
            }).then(function (res) {
              var data = res.data !== undefined ? res.data : res;
              var code = data.code !== undefined ? data.code : (data.Code !== undefined ? data.Code : -1);
              var msg = data.msg || data.Msg || '';

              if (code === 0) {
                $msg.text(msg || 'Đổi mật khẩu thành công!').removeClass('pw-error').addClass('pw-success');
                $('#current-pw').val('');
                $('#new-pw').val('');
                $('#confirm-pw').val('');
              } else {
                // code === 1: User không đúng, hoặc lỗi khác
                $msg.text(msg || 'Đổi mật khẩu thất bại');
              }
            }).catch(function (err) {
              console.error('Change password error', err);
              $msg.text('Lỗi kết nối. Vui lòng thử lại.');
            }).finally(function () {
              $btn.prop('disabled', false).text('CẬP NHẬT');
            });

          }
        });
      });
    })();
