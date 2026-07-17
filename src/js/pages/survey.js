(function () {
  'use strict';

  var params = window._routeParams || {};
  var mode = params.mode || 'list';
  var content = $('#content-area')[0];
  var authUser = JSON.parse(localStorage.getItem('auth_user') || '{}');
  var username = authUser.UserName || authUser.Username || authUser.username || '';
  var documentId = params.id || localStorage.getItem('survey_doc_id') || '';
  var questions = [];
  var answers = [];
  var current = 0;
  var timerId = null;
  var TOTAL_TIME = 300;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function recordsOf(response) {
    var data = response && (response.data || response);
    return (data && data.records) || [];
  }

  function timerKey() { return 'surveyStartTime:' + documentId; }

  function getRemainingTime() {
    var started = parseInt(sessionStorage.getItem(timerKey()) || '0', 10);
    var elapsed = started ? Math.floor((Date.now() - started) / 1000) : 0;
    return Math.max(0, TOTAL_TIME - elapsed);
  }

  function statusLabel(status) {
    if (status === 'COMPLETED') return 'Đã hoàn thành';
    if (status === 'NOT_STARTED') return 'Chưa làm';
    return 'Đang làm';
  }

  function showError(message) {
    content.innerHTML = '<p style="text-align:center;color:var(--color-danger);padding:48px 0">' + escapeHtml(message) + '</p>';
  }

  function showList() {
    localStorage.removeItem('survey_doc_id');
    content.innerHTML = '<div class="detail-content"><div class="skeleton" style="height:240px;border-radius:var(--radius-lg)"></div></div>';
    Http.get(API_CONFIG.ENDPOINTS.SURVEY.HISTORY, { q: JSON.stringify({ User: username }) })
      .then(function (response) {
        var rows = recordsOf(response);
        var pageSize = 10;
        var currentPage = 1;

        function renderPage() {
          var totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
          currentPage = Math.min(Math.max(currentPage, 1), totalPages);
          var start = (currentPage - 1) * pageSize;
          var pageRows = rows.slice(start, start + pageSize);
          var cards = pageRows.map(function (row) {
          var status = row.Status || 'IN_PROGRESS';
          var action = status === 'COMPLETED' ? 'view' : (status === 'NOT_STARTED' ? 'start' : 'continue');
          var actionText = status === 'COMPLETED' ? 'Xem kết quả' : (status === 'NOT_STARTED' ? 'Bắt đầu' : 'Tiếp tục');
          return '<div class="survey-card">' +
            '<div class="survey-title">' + escapeHtml(row.Title || 'Bài khảo sát') + '</div>' +
            '<div class="survey-time">Thời gian: ' + escapeHtml(row.ThoiGian || '-') + '</div>' +
            '<div class="survey-result">Trạng thái: ' + statusLabel(status) + '</div>' +
            (status === 'COMPLETED' ? '<div class="survey-result">Kết quả: ' + escapeHtml(row.KetQua || '0/0') + '</div>' : '') +
            '<button class="btn-start" onclick="navigate(\'#/survey?mode=' + action + '&id=' + encodeURIComponent(row.DocumentID) + '\')">' + actionText + '</button>' +
            '</div>';
          }).join('');

          content.innerHTML = '<div style="padding:16px">' +
            '<button class="btn-start" id="new-survey-btn">LÀM BÀI KHẢO SÁT MỚI</button>' +
            '<div class="survey-list" style="margin-top:16px">' + (cards || '<p class="empty-msg">Chưa có bài khảo sát</p>') + '</div>' +
            (rows.length ? '<div class="survey-pagination">' +
              '<button type="button" id="survey-prev"' + (currentPage === 1 ? ' disabled' : '') + '>Trước</button>' +
              '<span>Trang ' + currentPage + '/' + totalPages + ' · ' + rows.length + ' bài</span>' +
              '<button type="button" id="survey-next"' + (currentPage === totalPages ? ' disabled' : '') + '>Sau</button>' +
              '</div>' : '') +
            '</div>';
          $('#new-survey-btn')[0].onclick = createSurvey;
          if ($('#survey-prev').length) $('#survey-prev')[0].onclick = function () { currentPage--; renderPage(); };
          if ($('#survey-next').length) $('#survey-next')[0].onclick = function () { currentPage++; renderPage(); };
        }

        renderPage();
      })
      .catch(function (error) {
        console.error('Failed to load surveys', error);
        showError('Không tải được danh sách khảo sát.');
      });
  }

  function createSurvey() {
    var now = new Date();
    var date = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    var title = 'Bài khảo sát ngày ' + String(now.getDate()).padStart(2, '0') + '/' + String(now.getMonth() + 1).padStart(2, '0') + '/' + now.getFullYear();
    content.innerHTML = '<div class="detail-content"><div class="skeleton" style="height:200px;border-radius:var(--radius-lg)"></div></div>';

    Http.post(API_CONFIG.ENDPOINTS.SURVEY.START, {
      User: username,
      DocumentID: '',
      Title: title,
      ThoiGianBatDau: date,
      ThoiGianLamBai: '5',
      SoCauHoi: 3
    }).then(function (response) {
      var info = recordsOf(response)[0] || response.data || response;
      documentId = info.DocumentID || '';
      if (!documentId) throw new Error('API không trả về DocumentID');
      localStorage.setItem('survey_doc_id', documentId);
      renderIntro(info);
    }).catch(function (error) {
      console.error('Failed to create survey', error);
      showError('Không thể tạo bài khảo sát.');
    });
  }

  function renderIntro(info) {
    content.innerHTML = '<div class="detail-content">' +
      '<div><p>Bài khảo sát</p><p>' + escapeHtml(info.Title || 'Bài khảo sát') + '</p></div>' +
      '<div class="info-row"><span class="info-label">Số câu:</span><span class="info-value">' + escapeHtml(info.SoCauHoi || 3) + '</span></div>' +
      '<div class="info-row"><span class="info-label">Thời gian:</span><span class="info-value">' + escapeHtml(info.ThoiGianLamBai || '5') + ' phút</span></div>' +
      '<div class="info-row"><span class="info-label">Hạn:</span><span class="info-value">' + escapeHtml(info.HanThi || '-') + '</span></div>' +
      '<button class="btn-start" onclick="navigate(\'#/survey?mode=continue&id=' + encodeURIComponent(documentId) + '\')">BẮT ĐẦU</button>' +
      '</div>';
  }

  function startAssignedSurvey() {
    if (!documentId) return showError('Thiếu mã bài khảo sát.');
    Http.post(API_CONFIG.ENDPOINTS.SURVEY.START, {
      User: username,
      DocumentID: documentId
    }).then(function () {
      navigate('#/survey?mode=continue&id=' + encodeURIComponent(documentId));
    }).catch(function (error) {
      console.error('Failed to start assigned survey', error);
      showError('Không thể bắt đầu bài khảo sát.');
    });
  }

  function loadQuestions(readOnly) {
    if (!documentId) return showError('Thiếu mã bài khảo sát.');
    localStorage.setItem('survey_doc_id', documentId);
    content.innerHTML = '<div class="detail-content"><div class="skeleton" style="height:300px;border-radius:var(--radius-lg)"></div></div>';

    Http.get(API_CONFIG.ENDPOINTS.SURVEY.QUESTIONS, {
      q: JSON.stringify({ User: username, DocumentID: documentId })
    }).then(function (response) {
      questions = recordsOf(response).map(function (row, index) {
        var options = [row.DapAn1, row.DapAn2, row.DapAn3, row.DapAn4].filter(Boolean);
        return {
          text: row.NoiDung || ('Câu ' + (index + 1)),
          options: options,
          correctAnswer: parseInt(row.DapAnDung, 10) || 0,
          maCauHoi: row.MaCauHoi || ''
        };
      });
      if (!questions.length) return showError('Bài khảo sát chưa có câu hỏi.');
      if (readOnly) loadResult();
      else initQuiz();
    }).catch(function (error) {
      console.error('Failed to load questions', error);
      showError('Không tải được câu hỏi.');
    });
  }

  function initQuiz() {
    answers = Array(questions.length).fill(null);
    content.innerHTML = '<div class="timer-row"><span>⏰</span> <span id="timer">05:00</span></div>' +
      '<div class="question-nav" id="question-nav"></div>' +
      '<div class="question-card" id="question-card"></div>' +
      '<div class="nav-bar"><button class="nav-btn" id="prev-btn">Trước</button>' +
      '<button class="submit-btn" id="submit-btn">NỘP BÀI</button>' +
      '<button class="nav-btn" id="next-btn">Sau</button></div>';

    function renderNav() {
      $('#question-nav').html(questions.map(function (_, index) {
        return '<div class="question-circle' + (index === current ? ' active' : '') + '" onclick="goTo(' + index + ')">' + (index + 1) + '</div>';
      }).join(''));
    }
    function renderQuestion() {
      var question = questions[current];
      $('#question-card').html('<div class="question-title">' + escapeHtml(question.text) + '</div><div class="answer-list">' +
        question.options.map(function (option, index) {
          return '<label class="answer-radio"><input type="radio" name="answer" value="' + index + '" ' +
            (answers[current] === index ? 'checked' : '') + ' onchange="selectAnswer(' + index + ')">' + escapeHtml(option) + '</label>';
        }).join('') + '</div>');
    }
    window.goTo = function (index) { current = index; renderNav(); renderQuestion(); };
    window.selectAnswer = function (index) { answers[current] = index; };
    $('#prev-btn')[0].onclick = function () { if (current > 0) { current--; renderNav(); renderQuestion(); } };
    $('#next-btn')[0].onclick = function () { if (current < questions.length - 1) { current++; renderNav(); renderQuestion(); } };
    $('#submit-btn')[0].onclick = confirmSubmit;
    renderNav();
    renderQuestion();

    if (!sessionStorage.getItem(timerKey())) sessionStorage.setItem(timerKey(), Date.now().toString());
    updateTimer();
  }

  function updateTimer() {
    var remaining = getRemainingTime();
    $('#timer').text(String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0'));
    if (remaining > 0) timerId = setTimeout(updateTimer, 1000);
    else submitQuiz(true);
  }

  function confirmSubmit() {
    clearTimeout(timerId);
    var frozenRemaining = getRemainingTime();
    ConfirmModal.show({
      title: 'Nộp bài',
      message: 'Bạn có chắc chắn muốn nộp bài khảo sát?',
      icon: '📝',
      okText: 'Nộp bài',
      cancelText: 'Tiếp tục làm',
      onCancel: function () {
        sessionStorage.setItem(timerKey(), String(Date.now() - (TOTAL_TIME - frozenRemaining) * 1000));
        updateTimer();
      },
      onOk: function () { submitQuiz(false); }
    });
  }

  function submitQuiz(autoSubmitted) {
    clearTimeout(timerId);
    sessionStorage.removeItem(timerKey());
    content.innerHTML = '<div style="padding:48px;text-align:center"><p>' +
      (autoSubmitted ? '⏰ Hết giờ! Bài đang được nộp...' : 'Đang nộp bài...') +
      '</p><div class="skeleton" style="height:160px;border-radius:var(--radius-lg)"></div></div>';

    Http.post(API_CONFIG.ENDPOINTS.SURVEY.SUBMIT_QUIZ, {
      User: username,
      DocumentID: documentId,
      JsonKetQua: JSON.stringify(questions.map(function (question, index) {
        return { MaCauHoi: question.maCauHoi, DapAn: answers[index] == null ? 0 : answers[index] + 1 };
      }))
    }).then(loadResult).catch(function (error) {
      console.error('Failed to submit survey', error);
      showError('Nộp bài không thành công. Vui lòng thử lại.');
    });
  }

  function loadResult() {
    Http.get(API_CONFIG.ENDPOINTS.SURVEY.RESULTS, {
      q: JSON.stringify({ User: username, DocumentID: documentId })
    }).then(function (response) {
      var info = recordsOf(response)[0];
      if (!info) return showError('Không tìm thấy kết quả bài khảo sát.');
      showResults(info);
    }).catch(function (error) {
      console.error('Failed to load survey result', error);
      showError('Không tải được kết quả.');
    });
  }

  function showResults(info) {
    var correct = parseInt(info.SoCauDung || 0, 10);
    var wrong = parseInt(info.SoCauSai || 0, 10);
    var total = parseInt(info.TongCau || questions.length || 0, 10);
    content.innerHTML = '<div style="padding:16px"><h2>Kết quả</h2>' +
      '<div style="text-align:center;padding:24px;background:rgba(var(--color-primary-rgb),0.1);border-radius:16px">' +
      '<div>Điểm</div><div style="font-size:2rem;color:var(--color-primary)">' + correct + '</div>' +
      '<div>' + correct + '/' + total + '</div></div>' +
      '<div style="margin-top:24px"><div>Trả lời đúng: ' + correct + '</div><div>Trả lời sai/không trả lời: ' + wrong + '</div></div>' +
      '<button class="btn-start" onclick="navigate(\'#/survey\')">VỀ DANH SÁCH</button></div>';
  }

  if (mode === 'new') createSurvey();
  else if (mode === 'start') startAssignedSurvey();
  else if (mode === 'continue') loadQuestions(false);
  else if (mode === 'view') loadQuestions(true);
  else showList();
})();
