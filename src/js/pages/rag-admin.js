$(function() {
  const $dropzone = $('#rag-dropzone');
  const $fileInput = $('#rag-file-input');
  const $filePreview = $('#file-preview');
  const $fileName = $('#file-name');
  const $btnRemove = $('#btn-remove-file');
  const $form = $('#rag-upload-form');
  const $btnSubmit = $('#btn-submit-rag');

  let currentFile = null;
  let selectedReview = null;
  const reviewEndpoint = API_CONFIG.ENDPOINTS.AI.ADMIN_UPLOAD;

  // Initial UI state
  $filePreview.hide();

  // Click to open file dialog
  $dropzone.on('click', function() {
    $fileInput.click();
  });

  // Chặn trình duyệt tự động mở file khi kéo thả trượt ra ngoài vùng dropzone
  $(document).on('dragover drop', function(e) {
    e.preventDefault();
  });

  // Handle Drag & Drop sử dụng bộ đếm dragCounter chống nhấp nháy UI
  let dragCounter = 0;

  $dropzone.on('dragenter', function(e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    $dropzone.css('border-color', 'var(--color-primary)');
    $dropzone.css('background', 'rgba(0, 0, 0, 0.03)');
  });

  $dropzone.on('dragover', function(e) {
    e.preventDefault();
    e.stopPropagation();
  });

  $dropzone.on('dragleave', function(e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter === 0) {
      $dropzone.css('border-color', 'var(--color-border)');
      $dropzone.css('background', 'transparent');
    }
  });

  $dropzone.on('drop', function(e) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    $dropzone.css('border-color', 'var(--color-border)');
    $dropzone.css('background', 'transparent');
    
    const files = e.originalEvent.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  });

  // Handle File Input Change
  $fileInput.on('change', function(e) {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  });

  // Remove File
  $btnRemove.on('click', function(e) {
    e.stopPropagation(); // Ngăn click lan ra ngoài
    currentFile = null;
    $fileInput.val('');
    $filePreview.hide();
    $dropzone.show();
  });

  function handleFile(file) {
    const validExts = ['pdf', 'xlsx', 'png', 'jpg', 'jpeg'];
    const ext = file.name.split('.').pop().toLowerCase();
    
    if (!validExts.includes(ext)) {
      Alert.error('Chỉ hỗ trợ PDF, XLSX, PNG và JPG/JPEG.');
      return;
    }

    if (file.size === 0) {
      Alert.error('File rỗng, vui lòng chọn file khác.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      Alert.error('File vượt quá giới hạn 10 MB.');
      return;
    }

    currentFile = file;
    $fileName.text(file.name);
    $dropzone.hide();
    $filePreview.css('display', 'flex'); // Flex to match layout
  }

  // Handle Form Submit
  $form.on('submit', async function(e) {
    e.preventDefault();
    
    if (!currentFile) {
      Alert.error('Vui lòng chọn một file dữ liệu để tải lên');
      return;
    }

    // Cảnh báo xác nhận trước khi đồng bộ lên AI sử dụng SweetAlert2
    const isConfirmed = await Alert.confirm("Bạn có chắc chắn muốn đồng bộ tài liệu này lên hệ thống AI không? Dữ liệu cũ của tài liệu này (nếu có) sẽ được tự động cập nhật mới.", "Đồng bộ Tri thức");
    if (!isConfirmed) {
      return;
    }

    const title = $('#rag-title').val().trim();
    const sourceType = $('#rag-source-type').val();
    const sourceReference = $('#rag-source-reference').val().trim();
    const expiry = $('#rag-expiry').val(); // YYYY-MM-DD

    if (!title || !sourceType || !sourceReference) {
      Alert.error('Vui lòng nhập đầy đủ tiêu đề, loại nguồn và mô tả nguồn.');
      return;
    }
    
    $btnSubmit.prop('disabled', true).html('<span class="spinner-dot"></span> Đang tải lên...');

    const doUpload = async function(fileToUpload) {
      try {
        const formData = new FormData();
        formData.append('file', fileToUpload);
        formData.append('title', title);
        formData.append('sourceType', sourceType);
        formData.append('sourceReference', sourceReference);
        formData.append('sourceChannel', 'RAG_ADMIN');
        formData.append('expiryDate', expiry || 'never');
        
        const userStr = localStorage.getItem('auth_user');
        if (userStr) {
          const user = JSON.parse(userStr);
          formData.append('username', user.UserName || user.Username || user.username || '');
          formData.append('role', user.Role || 'user');
        }

        const result = await Http.postForm(API_CONFIG.ENDPOINTS.AI.ADMIN_UPLOAD, formData);
        
        if (result && result.status !== "error") {
          Alert.success('File đã vào hàng đợi quét an toàn và kiểm duyệt. Chatbot chưa sử dụng tài liệu này.');
          setTimeout(() => {
            $btnRemove.click();
            $('#rag-title').val('');
            $('#rag-source-type').val('');
            $('#rag-source-reference').val('');
            $('#rag-expiry').val('');
          }, 1500);
        } else {
          throw new Error(result.error || result.message || 'Lỗi xử lý từ hệ thống AI');
        }
      } catch (err) {
        console.error('Upload Error:', err);
        Alert.error('Tải lên thất bại: ' + err.message);
      } finally {
        $btnSubmit.prop('disabled', false).html('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Đồng bộ Tri thức lên AI');
      }
    };

    doUpload(currentFile);
  });

  const $reviewList = $('#rag-review-list');
  const $reviewEditor = $('#rag-review-editor');
  const $reviewContent = $('#rag-review-content');
  const $reviewMeta = $('#rag-review-meta');
  const $reviewMessage = $('#rag-review-message');
  const $refreshReviews = $('#btn-refresh-rag-reviews');
  const $effectiveFrom = $('#rag-effective-from');
  const $effectiveTo = $('#rag-effective-to');
  const $lifecycleList = $('#rag-lifecycle-list');
  const $lifecycleMessage = $('#rag-lifecycle-message');
  const $refreshLifecycle = $('#btn-refresh-rag-lifecycle');

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character];
    });
  }

  function authUserName() {
    try {
      const user = JSON.parse(localStorage.getItem('auth_user') || '{}');
      return user.UserName || user.Username || user.username || user.DisplayName || '';
    } catch (_) {
      return '';
    }
  }

  function recordsOf(result) {
    return result && (result.records || result.data?.records || result.data || result) || [];
  }

  function showReviewMessage(message, isError) {
    $reviewMessage.text(message || '').toggleClass('is-error', Boolean(isError));
  }

  function renderReviewList(records) {
    if (!Array.isArray(records) || !records.length) {
      $reviewList.html('<p class="rag-review-empty">Không có tài liệu chờ duyệt.</p>');
      return;
    }
    $reviewList.html(records.map(function(record) {
      const active = selectedReview && selectedReview.documentID === record.documentID ? ' is-selected' : '';
      return '<button type="button" class="rag-review-item' + active + '" data-document-id="' + escapeHtml(record.documentID) + '">' +
        '<strong>' + escapeHtml(record.title || record.originalFileName) + '</strong>' +
        '<span>' + escapeHtml(record.originalFileName || '-') + '</span>' +
        '<small>' + escapeHtml(record.extractionMethod || 'OCR') + ' · ' + escapeHtml(record.contentLength || 0) + ' ký tự</small>' +
        '</button>';
    }).join(''));
  }

  function renderReviewMeta(record) {
    $reviewMeta.html(
      '<strong>' + escapeHtml(record.title || '-') + '</strong>' +
      '<span>' + escapeHtml(record.originalFileName || '-') + ' · Nguồn: ' + escapeHtml(record.sourceType || '-') + '</span>' +
      '<span>Quét: ' + escapeHtml(record.malwareScanStatus || '-') + ' · Phiên bản: ' + escapeHtml(record.contentVersion || '-') + ' · Revision: ' + escapeHtml(record.editRevision || '-') + '</span>'
    );
  }

  async function loadReviewList() {
    showReviewMessage('');
    $refreshReviews.prop('disabled', true);
    try {
      const result = await Http.post(reviewEndpoint, { operation: 'LIST_REVIEWS', username: authUserName() });
      const records = recordsOf(result);
      renderReviewList(records);
      if (selectedReview && records.every(function(record) { return record.documentID !== selectedReview.documentID; })) {
        selectedReview = null;
        $reviewEditor.prop('hidden', true);
      }
    } catch (error) {
      $reviewList.html('<p class="rag-review-empty">Không tải được hàng đợi kiểm duyệt.</p>');
      showReviewMessage(error.message, true);
    } finally {
      $refreshReviews.prop('disabled', false);
    }
  }

  async function openReview(documentID) {
    try {
      const result = await Http.post(reviewEndpoint, { operation: 'GET_REVIEW', documentID: documentID, username: authUserName() });
      const record = recordsOf(result)[0] || result.data || result;
      if (!record || !record.documentID) throw new Error('Không nhận được nội dung bản nháp.');
      selectedReview = record;
      renderReviewMeta(record);
      $reviewContent.val(record.editedContent || '');
      $effectiveFrom.val(record.effectiveFromDate || '');
      $effectiveTo.val(record.effectiveToDate || '');
      $reviewEditor.prop('hidden', false);
      renderReviewList(recordsOf(await Http.post(reviewEndpoint, { operation: 'LIST_REVIEWS', username: authUserName() })));
    } catch (error) {
      showReviewMessage(error.message, true);
    }
  }

  async function performReview(operation, reason) {
    if (!selectedReview) return;
    const payload = {
      operation: operation,
      documentID: selectedReview.documentID,
      contentVersion: Number(selectedReview.contentVersion || 0),
      editRevision: Number(selectedReview.editRevision || 0),
      editedContent: $reviewContent.val(),
      reason: reason || '',
      effectiveFromDate: $effectiveFrom.val(),
      effectiveToDate: $effectiveTo.val(),
      username: authUserName()
    };
    try {
      const result = await Http.post(reviewEndpoint, payload);
      const row = recordsOf(result)[0] || result.data || result;
      showReviewMessage(row.message || 'Đã xử lý tài liệu.');
      selectedReview = null;
      $reviewEditor.prop('hidden', true);
      await loadReviewList();
    } catch (error) {
      showReviewMessage(error.message, true);
    }
  }

  $reviewList.on('click', '.rag-review-item', function() { openReview($(this).data('document-id')); });
  $refreshReviews.on('click', loadReviewList);
  $('#btn-save-rag-review').on('click', function() { performReview('SAVE_REVIEW'); });
  $('#btn-approve-rag-review').on('click', async function() {
    if (await Alert.confirm('Nội dung đã chính xác và có thể cho chatbot sử dụng?', 'Phê duyệt OCR')) performReview('APPROVE_REVIEW');
  });
  $('#btn-reject-rag-review').on('click', async function() {
    const reason = window.prompt('Nhập lý do từ chối tài liệu:');
    if (reason && reason.trim()) performReview('REJECT_REVIEW', reason.trim());
  });

  function lifecycleLabel(status) {
    return { ACTIVE: 'Đang hiệu lực', SCHEDULED: 'Chưa hiệu lực', EXPIRED: 'Hết hiệu lực', WITHDRAWN: 'Đã thu hồi' }[status] || status || '-';
  }

  function renderLifecycle(records) {
    if (!Array.isArray(records) || !records.length) {
      $lifecycleList.html('<p class="rag-review-empty">Chưa có tài liệu đã phê duyệt.</p>');
      return;
    }
    $lifecycleList.html(records.map(function(record) {
      const canWithdraw = record.lifecycleStatus !== 'WITHDRAWN';
      const dates = (record.effectiveFrom || 'Không giới hạn') + ' → ' + (record.effectiveToDate || 'Không giới hạn');
      return '<article class="rag-lifecycle-item">' +
        '<div><strong>' + escapeHtml(record.title || record.originalFileName) + '</strong>' +
        '<span>' + escapeHtml(dates) + '</span>' +
        '<small>' + escapeHtml(record.revocationReason || record.sourceReference || '') + '</small></div>' +
        '<span class="rag-lifecycle-status is-' + escapeHtml(String(record.lifecycleStatus || '').toLowerCase()) + '">' + escapeHtml(lifecycleLabel(record.lifecycleStatus)) + '</span>' +
        (canWithdraw ? '<button type="button" class="rag-danger-button btn-withdraw-rag" data-document-id="' + escapeHtml(record.documentID) + '">Thu hồi</button>' : '') +
        '</article>';
    }).join(''));
  }

  async function loadLifecycle() {
    $refreshLifecycle.prop('disabled', true);
    $lifecycleMessage.text('').removeClass('is-error');
    try {
      const result = await Http.post(reviewEndpoint, { operation: 'LIST_LIFECYCLE', username: authUserName() });
      renderLifecycle(recordsOf(result));
    } catch (error) {
      $lifecycleList.html('<p class="rag-review-empty">Không tải được trạng thái hiệu lực.</p>');
      $lifecycleMessage.text(error.message).addClass('is-error');
    } finally {
      $refreshLifecycle.prop('disabled', false);
    }
  }

  $refreshLifecycle.on('click', loadLifecycle);
  $lifecycleList.on('click', '.btn-withdraw-rag', async function() {
    const documentID = $(this).data('document-id');
    const reason = window.prompt('Nhập lý do thu hồi tài liệu:');
    if (!reason || !reason.trim()) return;
    if (!await Alert.confirm('Thu hồi ngay và loại tài liệu khỏi chatbot?', 'Thu hồi tài liệu')) return;
    try {
      const result = await Http.post(reviewEndpoint, { operation: 'WITHDRAW_DOCUMENT', documentID: documentID, reason: reason.trim(), username: authUserName() });
      const row = recordsOf(result)[0] || result.data || result;
      $lifecycleMessage.text(row.message || 'Đã thu hồi tài liệu.').removeClass('is-error');
      await loadLifecycle();
    } catch (error) {
      $lifecycleMessage.text(error.message).addClass('is-error');
    }
  });

  loadReviewList();
  loadLifecycle();

});
