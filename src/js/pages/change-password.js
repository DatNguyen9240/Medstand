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
        if (!currentPw) { $msg.text('Vui lòng nh?p m?t kh?u hi?n t?i'); return; }
        if (!newPw) { $msg.text('Vui lòng nh?p m?t kh?u m?i'); return; }
        if (newPw.length < 6) { $msg.text('M?t kh?u m?i t?i thi?u 6 ký t?'); return; }
        if (newPw !== confirmPw) { $msg.text('Xác nh?n m?t kh?u không kh?p'); return; }

        ConfirmModal.show({
          title: 'Ð?i m?t kh?u',
          message: 'B?n có ch?c ch?n mu?n d?i m?t kh?u?',
          icon: '??',
          okText: 'Xác nh?n',
          cancelText: 'H?y',
          onOk: function () {
            var $btn = $('#btn-update');
            $btn.prop('disabled', true).text('Ðang x? lý...');

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
                $msg.text(msg || 'Ð?i m?t kh?u thành công!').removeClass('pw-error').addClass('pw-success');
                $('#current-pw').val('');
                $('#new-pw').val('');
                $('#confirm-pw').val('');
              } else {
                // code === 1: User không dúng, ho?c l?i khác
                $msg.text(msg || 'Ð?i m?t kh?u th?t b?i');
              }
            }).catch(function (err) {
              console.error('Change password error', err);
              $msg.text('L?i k?t n?i. Vui lòng th? l?i.');
            }).finally(function () {
              $btn.prop('disabled', false).text('C?P NH?T');
            });

          }
        });
      });
    })();
