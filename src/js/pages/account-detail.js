    (function () {
      function fillProfile(data) {
        $('#profile-skeleton').prop('hidden', true);
        $('#profile-content').prop('hidden', false);
        $('#info-fullName').text(data.DisplayName || data.UserName || '-');
        $('#info-phone').text(data.Phone || '-');
        $('#info-email').text(data.Email || '-');
        $('#info-birthDate').text(data.NgaySinh || '-');
        $('#info-gender').text(data.GioiTinh || '-');
        AuthService.syncUserDisplay('', '#profile-avatar');
      }

      // G?i API l?y thông tin user m?i nh?t
      Http.get(API_CONFIG.ENDPOINTS.AUTH.USER_INFO, { q: '{}' })
        .then(function (res) {
          var data = res.data || res;
          var user = (data.records && data.records[0]) || data;
          // C?p nh?t localStorage v?i data m?i
          localStorage.setItem('auth_user', JSON.stringify(user));
          fillProfile(user);
        })
        .catch(function () {
          // Fallback localStorage n?u API l?i
          var stored = localStorage.getItem('auth_user');
          if (stored) {
            fillProfile(JSON.parse(stored));
          } else {
            $('#profile-skeleton').prop('hidden', true);
            $('#profile-content').prop('hidden', false);
          }
        });
    })();
