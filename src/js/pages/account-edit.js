    (function () {
      var user = JSON.parse(localStorage.getItem('auth_user') || '{}');
      var _avatarBase64 = ''; // base64 avatar mới (không có prefix "data:...")

      // ── Prefill ─────────────────────────────────────────────────────────
      function prefill(data) {
        $('#fieldDisplayName').val(data.DisplayName || '');
        $('#fieldUserName').val(data.UserName || '');
        $('#fieldEmail').val(data.Email || '');

        // Ngày sinh: ISO string → lấy 10 ký tự (yyyy-MM-dd) cho input[type=date]
        var ns = data.NgaySinh || '';
        if (ns) $('#fieldNgaySinh').val(ns.substring(0, 10));

        // Giới tính
        var gt = data.GioiTinh || '';
        $('input[name="gioiTinh"]').each(function () {
          if ($(this).val() === gt) $(this).prop('checked', true);
        });

        // Avatar
        if (data.Avatar) {
          _avatarBase64 = data.Avatar.startsWith('data:') ? data.Avatar.split(',')[1] : data.Avatar;
          var src = data.Avatar.startsWith('data:') ? data.Avatar : 'data:image/jpeg;base64,' + data.Avatar;
          $('#avatarPreview').attr('src', src);
        } else if (data.DisplayName) {
          $('#avatarPreview').attr('src',
            'https://ui-avatars.com/api/?name=' + encodeURIComponent(data.DisplayName) + '&background=3c50e0&color=fff');
        }
      }

      // Prefill ngay từ localStorage
      if (user.UserName) prefill(user);

      // Sau đó fetch thông tin mới nhất từ server
      Http.get(API_CONFIG.ENDPOINTS.AUTH.USER_INFO, { q: '{}' })
        .then(function (res) {
          var data = res.data || res;
          var serverUser = (data.records && data.records[0]) || data;
          var merged = Object.assign({}, user, serverUser);
          localStorage.setItem('auth_user', JSON.stringify(merged));
          user = merged;
          prefill(merged);
        })
        .catch(function () { /* giữ localStorage đã prefill */ });

      // ── Avatar picker ─────────────────────────────────────────────────
      $('#avatarInput').on('change', function () {
        var file = this.files && this.files[0];
        if (!file) return;
        // Giới hạn kích thước 2MB
        if (file.size > 2 * 1024 * 1024) {
          Alert.warning('Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn 2MB.');
          return;
        }
        var reader = new FileReader();
        reader.onload = function (e) {
          var dataUrl = e.target.result;
          $('#avatarPreview').attr('src', dataUrl);
          _avatarBase64 = dataUrl.split(',')[1] || '';
        };
        reader.readAsDataURL(file);
      });

      // ── Save ─────────────────────────────────────────────────────────
      $('#btnSave').on('click', function () {
        var displayName = $('#fieldDisplayName').val().trim();
        if (!displayName) { Alert.warning('Vui lòng nhập họ và tên.'); return; }

        var email = $('#fieldEmail').val().trim();
        var ngaySinh = $('#fieldNgaySinh').val() || '1900-01-01'; // SP cần DATETIME, gửi ISO string
        var gioiTinh = $('input[name="gioiTinh"]:checked').val() || '';

        var $btn = $(this);
        $btn.prop('disabled', true).text('Đang lưu...');

        Http.post(API_CONFIG.ENDPOINTS.AUTH.UPDATE_USER, {
          User: user.UserName || '',
          UserName: user.UserName || '',
          DisplayName: displayName,
          Email: email,
          NgaySinh: ngaySinh,
          GioiTinh: gioiTinh,
          Avatar: _avatarBase64 || ''
        }).then(function (res) {
          var data = res.data || res;
          var record = Array.isArray(data) ? data[0] : (data.records ? data.records[0] : data);
          var msg = record && record.Msg ? record.Msg : '';
          var msgType = record && record.MsgType !== undefined ? record.MsgType : 5;

          if (msgType == 1) {
            Alert.error(msg || 'Có lỗi xảy ra khi cập nhật.');
            $btn.prop('disabled', false).text('LƯU THAY ĐỔI');
            return;
          }

          // Cập nhật localStorage để các trang khác dùng ngay
          user.DisplayName = displayName;
          user.Email = email;
          user.NgaySinh = ngaySinh;
          user.GioiTinh = gioiTinh;
          if (_avatarBase64) user.Avatar = _avatarBase64;
          localStorage.setItem('auth_user', JSON.stringify(user));

          Alert.success(msg || 'Cập nhật thành công!');
          setTimeout(function () {
            navigate('#/account-detail');
          }, 1200);
        }).catch(function (err) {
          Alert.error(err.message || 'Có lỗi xảy ra.');
          $btn.prop('disabled', false).text('LƯU THAY ĐỔI');
        });
      });
    })();
