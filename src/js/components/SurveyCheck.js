/**
 * SurveyCheck — kiểm tra khảo sát hàng ngày trên MỌI trang
 * Tự inject modal + gọi API. Yêu cầu: api.config.js, http.js đã load trước.
 *
 * ⚡ Đổi thành false để TẮT survey check khi develop
 */
var SURVEY_CHECK_ENABLED = false;

(function () {
  if (!SURVEY_CHECK_ENABLED) return;

  // Không chạy trên trang login, register, survey (đang làm khảo sát)
  var path = window.location.pathname.toLowerCase();
  if (path.indexOf('login') !== -1 || path.indexOf('register') !== -1 || path.indexOf('survey.html') !== -1) {
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

    // Thêm keyframe animation
    var style = document.createElement('style');
    style.textContent = '@keyframes surveyModalFadeIn{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}';
    document.head.appendChild(style);

    document.body.insertAdjacentHTML('beforeend', modalHTML);
  }

  // Gọi API kiểm tra
  if (typeof Http !== 'undefined' && typeof API_CONFIG !== 'undefined') {
    Http.get(API_CONFIG.ENDPOINTS.SURVEY.CHECK_DAILY)
      .then(function (res) {
        var data = res.data || res;
        var record = (data.records && data.records[0]) || {};
        // KiemTra === "1" nghĩa là CHƯA làm khảo sát
        if (record.KiemTra === "1") {
          var modal = document.getElementById('survey-modal');
          if (modal) {
            modal.style.display = 'flex';
          }
          var btnConfirm = document.getElementById('btn-confirm-survey');
          if (btnConfirm) {
            btnConfirm.onclick = function () {
              // Xác định đường dẫn tới survey.html
              var isRoot = path.indexOf('/pages/') === -1 && !path.endsWith('/pages');
              var surveyUrl = isRoot ? 'pages/survey.html' : 'survey.html';
              window.location.href = surveyUrl;
            };
          }
        }
      })
      .catch(function (err) {
        console.error('[SurveyCheck] Failed:', err);
      });
  }
})();
