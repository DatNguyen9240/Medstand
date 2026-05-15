/**
 * SurveyCheck — kiểm tra khảo sát hàng ngày trên MỌI trang
 * Tự inject modal + gọi API. Yêu cầu: api.config.js, http.js đã load trước.
 *
 * ⚡ Đổi thành false để TẮT survey check khi develop
 */
var SURVEY_CHECK_ENABLED = true;
var _surveyDoneToday = false; // Chỉ gọi API 1 lần khi đã xác nhận xong

(function () {
  window.triggerSurveyCheck = function () {
    if (!SURVEY_CHECK_ENABLED) return;
    if (_surveyDoneToday) return; // Đã xong rồi, bỏ qua

    // Không chạy trên trang login, register, survey (đang làm khảo sát)
    var hash = (location.hash || '').toLowerCase();
    if (hash.indexOf('login') !== -1 || hash.indexOf('register') !== -1 || hash.indexOf('survey') !== -1) {
      return;
    }

    // Inject modal HTML nếu chưa có
    if (!document.getElementById('survey-modal')) {
      var modalHTML =
        '<div class="modal-overlay" id="survey-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(2px);align-items:center;justify-content:center;z-index:9999;">' +
        '  <div style="background:var(--color-surface,#fff);width:85%;max-width:420px;padding:2.5rem 1.5rem;border-radius:var(--radius-xl,16px);box-shadow:var(--shadow-lg,0 8px 32px rgba(0,0,0,.15));text-align:center;animation:surveyModalFadeIn .3s cubic-bezier(.34,1.56,.64,1);">' +
        '    <div><p style="font-size:1.125rem;color:var(--color-text,#1a1a2e);line-height:1.6;margin-bottom:2rem;font-weight:500;">Bạn cần trả lời các câu hỏi khảo sát</p></div>' +
        '    <div><button type="button" id="btn-confirm-survey" style="width:100%;background:#10b981;color:#fff;border:none;padding:12px 24px;min-height:48px;border-radius:var(--radius-md,12px);font-size:1rem;font-weight:600;cursor:pointer;box-shadow:0 4px 10px rgba(16,185,129,0.2);">Xác nhận</button></div>' +
        '  </div>' +
        '</div>';

      var style = document.createElement('style');
      style.textContent = '@keyframes surveyModalFadeIn{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}';
      document.head.appendChild(style);

      document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    // Gọi API kiểm tra
    if (typeof Http !== 'undefined' && typeof API_CONFIG !== 'undefined') {
      var authUser = JSON.parse(localStorage.getItem('auth_user') || '{}');
      var userName = authUser.UserName || authUser.Username || authUser.username || '';
      
      console.log('[SurveyCheck] Checking status for User:', userName);
      Http.get(API_CONFIG.ENDPOINTS.SURVEY.CHECK_DAILY, { q: JSON.stringify({ User: userName }) })
        .then(function (res) {
          var data = res.data || res;
          var record = (data.records && data.records[0]) || {};
          console.log('[SurveyCheck] API Response:', record);

          if (record.KiemTra === "1") {
            console.log('[SurveyCheck] Survey required. Showing modal.');
            var modal = document.getElementById('survey-modal');
            if (modal) {
              modal.style.display = 'flex';
            }
            var btnConfirm = document.getElementById('btn-confirm-survey');
            if (btnConfirm) {
              btnConfirm.onclick = function () {
                modal.style.display = 'none';
                navigate('#/survey');
              };
            }
          } else {
            _surveyDoneToday = true; // Lưu lại: hôm nay đã xong, không gọi API nữa
            console.log('[SurveyCheck] Survey not required (KiemTra=0).');
          }
        })
        .catch(function (err) {
          console.error('[SurveyCheck] API Error:', err);
        });
    } else {
      console.warn('[SurveyCheck] Http or API_CONFIG missing.');
    }
  };

  // Khởi chạy lần đầu
  triggerSurveyCheck();

  // Lắng nghe sự kiện đổi trang (SPA)
  // Dùng setTimeout để đảm bảo localStorage đã cập nhật thông tin user mới trước khi kiểm tra
  window.addEventListener('hashchange', function () {
    setTimeout(triggerSurveyCheck, 1000);
  });
})();
