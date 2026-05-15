    (function () {
      var LIMIT = 20;
      var searchText = '';
      var allRecords = [];

      new FilterComponent({
        container: '#filter-container',
        fields: [],
        onApply: function () { loadData(); },
        onSearch: function (keyword) { searchText = keyword; loadData(); }
      });

      TotalBar.init({ onPageChange: function (page) { renderPage(page); } });

      function getResultClass(ketQua) {
        if (!ketQua) return 'zero';
        var parts = ketQua.split('/');
        var correct = parseInt(parts[0]) || 0;
        var total = parseInt(parts[1]) || 1;
        if (correct === total) return 'perfect';
        if (correct > 0) return 'partial';
        return 'zero';
      }

      function renderCard(r) {
        var cls = getResultClass(r.KetQua);
        return '<div class="survey-card" onclick="localStorage.setItem(\'survey_doc_id\',\'' + r.DocumentID + '\');navigate(\'#/survey\')">' +
          '<div class="survey-title">' + (r.Title || 'Bài khảo sát') + '</div>' +
          '<div class="survey-time">Thời gian: ' + (r.ThoiGian || '-') + '</div>' +
          '<div class="survey-result ' + cls + '">Kết quả: ' + (r.KetQua || '0/0') + '</div>' +
          '</div>';
      }

      function renderPage(page) {
        var filtered = allRecords;
        if (searchText) {
          var kw = Format.removeAccents(searchText);
          filtered = allRecords.filter(function (r) {
            var text = Format.removeAccents((r.Title || '') + ' ' + (r.ThoiGian || '') + ' ' + (r.KetQua || ''));
            return text.indexOf(kw) >= 0;
          });
        }

        var totalPages = Math.ceil(filtered.length / LIMIT) || 1;
        var start = (page - 1) * LIMIT;
        var pageItems = filtered.slice(start, start + LIMIT);

        var $list = $('#survey-list');
        $list.prop('hidden', false);
        $list.html(pageItems.length ? pageItems.map(renderCard).join('') : '<p class="empty-msg">Không có dữ liệu</p>');

        TotalBar.show({ currentPage: page, totalPages: totalPages });
      }

      function loadData() {
        $('#skeleton-list').prop('hidden', false);
        $('#survey-list').prop('hidden', true);

        var authUser = JSON.parse(localStorage.getItem('auth_user') || '{}');
        var payload = { User: authUser.UserName || authUser.Username || authUser.username || '' };

        Http.get(API_CONFIG.ENDPOINTS.SURVEY.HISTORY, { q: JSON.stringify(payload) })
          .then(function (res) {
            var data = res.data || res;
            allRecords = data.records || [];
            $('#skeleton-list').prop('hidden', true);
            renderPage(1);
          })
          .catch(function (err) {
            console.error('Failed to load survey history', err);
            $('#skeleton-list').prop('hidden', true);
            $('#survey-list').prop('hidden', false).html('<p class="empty-msg">Không tải được dữ liệu</p>');
          });
      }

      // loadData triggered by FilterComponent auto-apply
    })();
