    (function () {
// determine if quiz or detail
    const params = (window._routeParams || {});
    const startQuiz = params.start === '1';
    const content = $('#content-area')[0];
    let questions = [];
    let current = 0;
    let answers = [];
    const TOTAL_TIME = 300; // 5 phút
    let timerId;

    function getRemainingTime() {
      const startTime = parseInt(sessionStorage.getItem('surveyStartTime') || '0', 10);
      const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
      return Math.max(0, TOTAL_TIME - elapsed);
    }

    function initQuiz() {
      answers = Array(questions.length).fill(null);
      content.innerHTML = `
      <div class="timer-row"><span>⏰</span> <span id="timer">05:00</span></div>
      <div class="question-nav" id="question-nav"></div>
      <div class="question-card" id="question-card"></div>
      <div class="nav-bar">
        <button class="nav-btn" id="prev-btn">Trước</button>
        <button class="submit-btn" id="submit-btn">NỘP BÀI</button>
        <button class="nav-btn" id="next-btn">Sau</button>
      </div>
      `;
      function renderNav() {
        $('#question-nav').html(questions.map((q, i) => `<div class="question-circle${i === current ? ' active' : ''}" onclick="goTo(${i})">${i + 1}</div>`).join(''));
      }
      function renderQuestion() {
        const q = questions[current];
        $('#question-card').html(`<div class="question-title">${q.text}</div><div class="answer-list">${q.options.map((opt, j) => `<label class="answer-radio"><input type="radio" name="answer" value="${j}" ${answers[current] === j ? 'checked' : ''} onchange="selectAnswer(${j})">${opt}</label>`).join('')}</div>`);
      }
      window.goTo = function (i) { current = i; renderNav(); renderQuestion(); }
      window.selectAnswer = function (j) { answers[current] = j; }
      $('#prev-btn')[0].onclick = () => { if (current > 0) { current--; renderNav(); renderQuestion(); } };
      $('#next-btn')[0].onclick = () => { if (current < questions.length - 1) { current++; renderNav(); renderQuestion(); } };
      $('#submit-btn')[0].onclick = () => { finishQuiz(); };
      renderNav(); renderQuestion();
      if (!sessionStorage.getItem('surveyStartTime')) {
        sessionStorage.setItem('surveyStartTime', Date.now().toString());
      }
      function updateTimer() {
        const remaining = getRemainingTime();
        const m = Math.floor(remaining / 60), s = remaining % 60;
        $('#timer').text(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
        if (remaining > 0) { timerId = setTimeout(updateTimer, 1000); }
        else { autoSubmit(); }
      }
      updateTimer();
    }

    if (!startQuiz) {
      // ── Detail view: gọi API_BatDauBaiKhaoSat ──
      // Xóa timer cũ để bắt đầu mới khi nhấn BẮT ĐẦU
      sessionStorage.removeItem('surveyStartTime');
      content.innerHTML = '<div class="detail-content"><div class="skeleton" style="height:200px;border-radius:var(--radius-lg)"></div></div>';
      var authUser = JSON.parse(localStorage.getItem('auth_user') || '{}');
      var now = new Date();
      var thoiGianBatDau = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');

      Http.post(API_CONFIG.ENDPOINTS.SURVEY.START, {
        User: authUser.UserName || '',
        DocumentID: localStorage.getItem('survey_doc_id') || '',
        Title: 'Bài khảo sát số 01',
        ThoiGianBatDau: thoiGianBatDau,
        ThoiGianLamBai: '5p',
        SoCauHoi: 3
      }).then(function (res) {
        var data = res.data || res;
        var info = (data.records && data.records[0]) || data;
        if (info.DocumentID) localStorage.setItem('survey_doc_id', info.DocumentID);

        content.innerHTML =
          '<div class="detail-content">' +
          '  <div><p>Bài khảo sát</p><p>' + (info.Title || 'Bài khảo sát') + '</p></div>' +
          '  <div class="info-row"><span class="info-label">Số câu:</span><span class="info-value">' + (info.SoCauHoi || 0) + '</span></div>' +
          '  <div class="info-row"><span class="info-label">Thời gian làm bài:</span><span class="info-value">' + (info.ThoiGianLamBai || '-') + ' phút</span></div>' +
          '  <div class="info-row"><span class="info-label">Hạn thi:</span><span class="info-value">' + (info.HanThi || '-') + '</span></div>' +
          '  <button class="btn-start" onclick="navigate(\'#/survey?start=1\')">BẮT ĐẦU</button>' +
          '</div>';
      }).catch(function (err) {
        console.error('Failed to start survey', err);
        content.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);padding:48px 0">Không tải được bài khảo sát</p>';
      });
    } else {
      // ── Quiz view: gọi API_ChiTietBaiKhaoSat ──
      content.innerHTML = '<div class="detail-content"><div class="skeleton" style="height:300px;border-radius:var(--radius-lg)"></div></div>';
      var authUser2 = JSON.parse(localStorage.getItem('auth_user') || '{}');
      var docId = localStorage.getItem('survey_doc_id') || '';

      Http.get(API_CONFIG.ENDPOINTS.SURVEY.QUESTIONS, { q: JSON.stringify({ User: authUser2.UserName || '', DocumentID: docId }) })
        .then(function (res) {
          var data = res.data || res;
          var records = data.records || [];
          // Map API records → { text, options, correctAnswer, maCauHoi }
          questions = records.map(function (r, i) {
            var opts = [];
            if (r.DapAn1) opts.push(r.DapAn1);
            if (r.DapAn2) opts.push(r.DapAn2);
            if (r.DapAn3) opts.push(r.DapAn3);
            if (r.DapAn4) opts.push(r.DapAn4);
            return {
              text: r.NoiDung || ('Câu ' + (i + 1)),
              options: opts,
              correctAnswer: parseInt(r.DapAnDung) || 0, // 1-based
              maCauHoi: r.MaCauHoi || ''
            };
          });
          if (questions.length > 0) {
            initQuiz();
          } else {
            content.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);padding:48px 0">Không có câu hỏi</p>';
          }
        })
        .catch(function (err) {
          console.error('Failed to load questions', err);
          content.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);padding:48px 0">Không tải được câu hỏi</p>';
        });
    }
    // Hết giờ → tự nộp, bỏ qua confirm
    function autoSubmit() {
      clearTimeout(timerId);
      sessionStorage.removeItem('surveyStartTime');
      $('#timer').text('00:00');

      var docId = localStorage.getItem('survey_doc_id') || '';
      var authUser4 = JSON.parse(localStorage.getItem('auth_user') || '{}');

      content.innerHTML = '<div style="padding:48px;text-align:center"><p style="color:var(--color-danger);font-weight:600;margin-bottom:16px">⏰ Hết giờ! Bài đang được nộp...</p><div class="skeleton" style="height:200px;border-radius:var(--radius-lg)"></div></div>';

      Http.post(API_CONFIG.ENDPOINTS.SURVEY.SUBMIT_QUIZ, {
        User: authUser4.UserName || '',
        DocumentID: docId,
        JsonKetQua: JSON.stringify(questions.map((q, i) => ({ MaCauHoi: q.maCauHoi, DapAn: answers[i] !== null ? answers[i] + 1 : 0 })))
      }).then(function () {
        return Http.get(API_CONFIG.ENDPOINTS.SURVEY.RESULTS, { q: JSON.stringify({ DocumentID: docId }) });
      }).then(function (resKQ) {
        var kq = resKQ.data || resKQ;
        var info = (kq.records && kq.records[0]) || kq;
        var correct = parseInt(info.SoCauDung || info.Dung || 0);
        var wrong = parseInt(info.SoCauSai || info.Sai || 0);
        var total = parseInt(info.TongCau || info.SoCauHoi || questions.length);
        var unanswered = total - correct - wrong;
        var score = info.Diem || info.Score || correct;
        showResults(score, correct, wrong, unanswered, total);
      }).catch(function () {
        var correct = answers.filter(function (v, i) { return v !== null && questions[i] && (v + 1) === questions[i].correctAnswer; }).length;
        showResults(correct, correct, questions.length - correct, answers.filter(function (v) { return v === null; }).length, questions.length);
      });
    }

    // Hiển thị kết quả
    function showResults(score, correct, wrong, unanswered, total) {
      content.innerHTML =
        '<div style="padding:16px;">' +
        '  <h2>Kết quả</h2>' +
        '  <div style="text-align:center;padding:24px;background:rgba(var(--color-primary-rgb),0.1);border-radius:16px;">' +
        '    <div>Điểm</div>' +
        '    <div style="font-size:2rem;color:var(--color-primary);">' + score + '</div>' +
        '    <div style="color:var(--color-danger);">' + correct + '/' + total + '</div>' +
        '  </div>' +
        '  <div style="margin-top:24px;">' +
        '    <div>Trả lời đúng: ' + correct + '</div>' +
        '    <div style="background:var(--color-primary);height:8px;border-radius:4px;margin:4px 0;width:' + (total > 0 ? Math.round(correct / total * 100) : 0) + '%"></div>' +
        '    <div>Trả lời sai: ' + wrong + '</div>' +
        '    <div style="background:var(--color-danger,#dc2626);height:8px;border-radius:4px;margin:4px 0;width:' + (total > 0 ? Math.round(wrong / total * 100) : 0) + '%"></div>' +
        '    <div>Không trả lời: ' + unanswered + '</div>' +
        '    <div style="background:var(--color-border);height:8px;border-radius:4px;margin:4px 0;width:' + (total > 0 ? Math.round(unanswered / total * 100) : 0) + '%"></div>' +
        '  </div>' +
        '  <button class="btn-start" onclick="navigate(\'#/survey\')">TIẾP THEO</button>' +
        '</div>';
    }

    function finishQuiz() {
      clearTimeout(timerId);

      // Đóng băng timer ngay: lưu thời gian còn lại VÀ cập nhật sessionStorage
      var frozenRemaining = getRemainingTime();
      // Ghi đè startTime để getRemainingTime() luôn trả frozenRemaining trong lúc chờ
      sessionStorage.setItem('surveyStartTime', (Date.now() - (TOTAL_TIME - frozenRemaining) * 1000).toString());

      // 1) Gọi API nộp bài
      var docId = localStorage.getItem('survey_doc_id') || '';
      var authUser3 = JSON.parse(localStorage.getItem('auth_user') || '{}');

      Http.post(API_CONFIG.ENDPOINTS.SURVEY.SUBMIT_QUIZ, {
        User: authUser3.UserName || '',
        DocumentID: docId,
        JsonKetQua: JSON.stringify(questions.map((q, i) => ({ MaCauHoi: q.maCauHoi, DapAn: answers[i] !== null ? answers[i] + 1 : 0 })))
      }).then(function (res) {
        var data = res.data || res;
        var msg = (data.records && data.records[0] && data.records[0].Msg) || data.msg || 'Bạn có đồng ý nộp bài?';

        ConfirmModal.show({
          title: 'Nộp bài',
          message: msg,
          icon: '📝',
          okText: 'Nộp bài',
          cancelText: 'Tiếp tục làm',
          onCancel: function () {
            // Resume: tính lại startTime dựa trên frozenRemaining để tiếp tục đếm
            sessionStorage.setItem('surveyStartTime', (Date.now() - (TOTAL_TIME - frozenRemaining) * 1000).toString());
            function resumeTimer() {
              var remaining = getRemainingTime();
              var m = Math.floor(remaining / 60), s = remaining % 60;
              $('#timer').text(m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0'));
              if (remaining > 0) { timerId = setTimeout(resumeTimer, 1000); }
              else { autoSubmit(); }
            }
            resumeTimer();
          },
          onOk: function () {
            sessionStorage.removeItem('surveyStartTime');
            content.innerHTML = '<div style="padding:48px;text-align:center"><div class="skeleton" style="height:200px;border-radius:var(--radius-lg)"></div></div>';

            Http.get(API_CONFIG.ENDPOINTS.SURVEY.RESULTS, { q: JSON.stringify({ DocumentID: docId }) })
              .then(function (resKQ) {
                var kq = resKQ.data || resKQ;
                var info = (kq.records && kq.records[0]) || kq;
                var correct = parseInt(info.SoCauDung || info.Dung || 0);
                var wrong = parseInt(info.SoCauSai || info.Sai || 0);
                var total = parseInt(info.TongCau || info.SoCauHoi || questions.length);
                var unanswered = total - correct - wrong;
                var score = info.Diem || info.Score || correct;
                showResults(score, correct, wrong, unanswered, total);
              })
              .catch(function () {
                var correct = answers.filter(function (v, i) { return v !== null && questions[i] && (v + 1) === questions[i].correctAnswer; }).length;
                showResults(correct, correct, questions.length - correct, answers.filter(function (v) { return v === null; }).length, questions.length);
              });
          } // end onOk
        }); // end ConfirmModal.show
      }).catch(function (err) {
        console.error('Failed to submit quiz', err);
        Alert.error('Lỗi khi nộp bài. Vui lòng thử lại.');
      });
    }
})();
