$(function() {
  const $dropzone = $('#rag-dropzone');
  const $fileInput = $('#rag-file-input');
  const $filePreview = $('#file-preview');
  const $fileName = $('#file-name');
  const $btnRemove = $('#btn-remove-file');
  const $form = $('#rag-upload-form');
  const $btnSubmit = $('#btn-submit-rag');

  let currentFile = null;

  // Initial UI state
  $filePreview.hide();

  // Click to open file dialog
  $dropzone.on('click', function() {
    $fileInput.click();
  });

  // Handle Drag & Drop
  $dropzone.on('dragover', function(e) {
    e.preventDefault();
    $dropzone.css('border-color', 'var(--color-primary)');
    $dropzone.css('background', 'rgba(59, 130, 246, 0.05)');
  });

  $dropzone.on('dragleave', function(e) {
    e.preventDefault();
    $dropzone.css('border-color', 'rgb(148, 163, 184)');
    $dropzone.css('background', 'transparent');
  });

  $dropzone.on('drop', function(e) {
    e.preventDefault();
    $dropzone.css('border-color', 'rgb(148, 163, 184)');
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
    const validExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx'];
    const ext = file.name.split('.').pop().toLowerCase();
    
    if (!validExts.includes(ext)) {
      alert('Vui lòng chọn file văn bản (.pdf, .doc, .xlsx...)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('Kích thước file không được vượt quá 10MB');
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
      Alert.show('Vui lòng chọn một file dữ liệu để tải lên', 'error');
      return;
    }

    const title = $('#rag-title').val().trim();
    const expiry = $('#rag-expiry').val(); // YYYY-MM-DD
    
    $btnSubmit.prop('disabled', true).html('<span class="spinner-dot"></span> Đang tải lên...');

    const doUpload = async function(fileToUpload) {
      try {
        const formData = new FormData();
        formData.append('file', fileToUpload);
        formData.append('title', title);
        formData.append('expiryDate', expiry || 'never');
        
        const userStr = localStorage.getItem('auth_user');
        if (userStr) {
          const user = JSON.parse(userStr);
          formData.append('username', user.UserName || user.Username || user.username || '');
          formData.append('role', user.Role || 'user');
        }

        const webhookUrl = API_CONFIG.N8N_BASE + API_CONFIG.ENDPOINTS.AI.ADMIN_UPLOAD;
        
        const response = await fetch(webhookUrl, {
          method: 'POST',
          body: formData
        });

        const result = await response.json();
        
        if (response.ok && result && result.status !== "error") {
          Alert.show('Đã cập nhật hệ tri thức AI thành công!', 'success');
          setTimeout(() => {
            $btnRemove.click();
            $('#rag-title').val('');
            $('#rag-expiry').val('');
          }, 1500);
        } else {
          throw new Error(result.error || result.message || 'Lỗi xử lý từ hệ thống AI');
        }
      } catch (err) {
        console.error('Upload Error:', err);
        Alert.show('Tải lên thất bại: ' + err.message, 'error');
      } finally {
        $btnSubmit.prop('disabled', false).html('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"></path><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> Bơm vào não AI');
      }
    };

    const ext = currentFile.name.split('.').pop().toLowerCase();
    if (ext === 'xls' || ext === 'xlsx') {
      $btnSubmit.html('<span class="spinner-dot"></span> Đang bóc tách dữ liệu Excel...');
      if (!window.XLSX) {
          var script = document.createElement('script');
          script.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';
          script.onload = function() { processExcel(currentFile); };
          document.head.appendChild(script);
      } else {
          processExcel(currentFile);
      }

      function processExcel(f) {
          var r = new FileReader();
          r.onload = function(e) {
              try {
                  var data = new Uint8Array(e.target.result);
                  var workbook = XLSX.read(data, {type: 'array'});
                  var firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                  var csvStr = XLSX.utils.sheet_to_csv(firstSheet);
                  var b = new Blob([csvStr], {type: 'text/csv'});
                  var newF = new File([b], f.name.replace(/\.[^/.]+$/, "") + ".csv", {type: "text/csv"});
                  doUpload(newF);
              } catch(err) {
                  Alert.show('Tải lên thất bại: Xin lỗi, định dạng file Excel quá cũ hoặc có mật khẩu bảo vệ', 'error');
                  $btnSubmit.prop('disabled', false).html('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"></path><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg> Bơm vào não AI');
              }
          };
          r.readAsArrayBuffer(f);
      }
    } else {
        doUpload(currentFile);
    }
  });

});
