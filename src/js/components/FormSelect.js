/**
 * FormSelect — Reusable form field component
 * 
 * Hai loại:
 * 1. Input thường: text, date, tel, number...
 * 2. Input list (picker): click mở bottom-sheet modal chọn từ danh sách
 *
 * Sử dụng:
 *   // Tạo container
 *   var fs = new FormSelect({ container: '#my-form' });
 *   
 *   // Thêm input thường
 *   fs.addInput({ id: 'name', label: 'Tên', required: true, placeholder: 'Nhập tên' });
 *   fs.addInput({ id: 'date', label: 'Ngày', type: 'date', value: '2026-01-01' });
 *   
 *   // Thêm input list (modal picker)
 *   fs.addList({ id: 'branch', label: 'Chi nhánh', required: true, placeholder: 'Chọn chi nhánh',
 *     loadFn: function(done) { Http.get(...).then(res => done(records.map(r => ({ value: r.ID, label: r.Name })))); }
 *   });
 *   
 *   // Lấy tất cả giá trị
 *   var values = fs.getValues(); // { name: '...', date: '...', branch: '...' }
 *   
 *   // Set giá trị (cho edit mode)
 *   fs.setValue('name', 'Nguyễn Văn A');
 *   fs.setListValue('branch', 'HN', 'Hà Nội');
 *   
 *   // Reset
 *   fs.reset();
 */
var FormSelect = (function () {

  var arrowSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';

  function FormSelect(options) {
    this.$container = $(options.container);
    this._fields = {};   // { id: { type, label, placeholder, value, listValue } }
    this._caches = {};   // { id: data[] }
  }

  // ── addInput: thêm field nhập liệu thường ─────────────────────────────
  FormSelect.prototype.addInput = function (opts) {
    var id = opts.id;
    var type = opts.type || 'text';
    var req = opts.required ? '<span class="req">*</span>' : '';
    var value = opts.value || '';
    var placeholder = opts.placeholder || '';
    var full = opts.full ? ' style="grid-column:1/-1"' : '';

    var inputTag;
    if (type === 'textarea') {
      inputTag = '<textarea id="fs-' + id + '" class="fs-input" placeholder="' + placeholder + '">' + value + '</textarea>';
    } else {
      inputTag = '<input id="fs-' + id + '" class="fs-input" type="' + type + '" placeholder="' + placeholder + '" value="' + value + '">';
    }

    var html = '<div class="form-select-field"' + full + '>' +
      '<label>' + opts.label + req + '</label>' +
      inputTag +
      '</div>';

    this.$container.append(html);
    this._fields[id] = { type: 'input', inputType: type, label: opts.label, placeholder: placeholder };
    return this;
  };

  // ── addList: thêm field chọn từ danh sách (modal picker) ──────────────
  FormSelect.prototype.addList = function (opts) {
    var id = opts.id;
    var req = opts.required ? '<span class="req">*</span>' : '';
    var placeholder = opts.placeholder || opts.label;
    var full = opts.full ? ' style="grid-column:1/-1"' : '';

    var html = '<div class="form-select-field"' + full + '>' +
      '<label>' + opts.label + req + '</label>' +
      '<div class="fs-trigger" id="fs-' + id + '">' +
      '<span>' + placeholder + '</span>' +
      arrowSvg +
      '</div></div>';

    this.$container.append(html);

    this._fields[id] = {
      type: 'list',
      label: opts.label,
      placeholder: placeholder,
      loadFn: opts.loadFn,
      value: '',
      labelText: ''
    };

    // Bind click
    var self = this;
    $('#fs-' + id).on('click', function () {
      self._openPicker(id);
    });

    return this;
  };

  // ── _openPicker: mở bottom-sheet modal chọn từ danh sách ─────────────
  FormSelect.prototype._openPicker = function (id) {
    var field = this._fields[id];
    var $trigger = $('#fs-' + id);
    var self = this;

    $trigger.find('span:first-child').text('Đang tải...');

    field.loadFn(function (options) {
      $trigger.find('span:first-child').text(field.labelText || field.placeholder);

      // Nếu options rỗng hoặc null → không mở modal
      if (!options || options.length === 0) return;

      var html = '<div class="filter-modal-header">' +
        '<button type="button" class="filter-modal-close" aria-label="Đóng" id="picker-close">&times;</button>' +
        '<h3>' + field.label + '</h3>' +
        '</div>' +
        '<div style="padding:12px"><input type="search" class="fs-input" id="picker-search" placeholder="Tìm kiếm" style="width:100%"></div>' +
        '<ul class="select-modal-list" id="picker-list" style="max-height:50vh;overflow-y:auto;padding:0 12px">' +
        options.map(function (opt) {
          var val = (typeof opt === 'object') ? (opt.value || opt.ID || '') : opt;
          var lbl = (typeof opt === 'object') ? (opt.label || opt.Name || '') : opt;
          var selected = (field.value === val) ? ' class="selected"' : '';
          return '<li data-value="' + val + '"' + selected + '>' + lbl + '</li>';
        }).join('') +
        '</ul>';

      var $overlay = $('<div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:300;display:flex;align-items:flex-end"></div>');
      var $sheet = $('<div style="width:100%;max-height:80vh;background:var(--color-surface);border-radius:var(--radius-lg) var(--radius-lg) 0 0;display:flex;flex-direction:column;overflow-y:auto"></div>').html(html);
      $overlay.append($sheet).appendTo('body');

      // Close
      $overlay.find('#picker-close').on('click', function () { $overlay.remove(); });
      $overlay.on('click', function (e) { if (e.target === $overlay[0]) $overlay.remove(); });

      // Search
      $overlay.find('#picker-search').on('input', function () {
        var kw = $(this).val().toLowerCase();
        $overlay.find('#picker-list li').each(function () {
          $(this).css('display', $(this).text().toLowerCase().indexOf(kw) !== -1 ? '' : 'none');
        });
      });

      // Select
      $overlay.find('#picker-list li').on('click', function () {
        var val = $(this).attr('data-value');
        var lbl = $(this).text();
        field.value = val;
        field.labelText = lbl;
        $trigger.find('span:first-child').text(lbl);
        $trigger.addClass('has-value');
        $overlay.remove();

        // Callback
        if (field.onChange) field.onChange(val, lbl);
      });
    });
  };

  // ── setValue: set giá trị cho input thường ─────────────────────────────
  FormSelect.prototype.setValue = function (id, value) {
    $('#fs-' + id).val(value);
    return this;
  };

  // ── setListValue: set giá trị cho list field ──────────────────────────
  FormSelect.prototype.setListValue = function (id, value, label) {
    var field = this._fields[id];
    if (!field || field.type !== 'list') return this;
    field.value = value;
    field.labelText = label || value;
    var $trigger = $('#fs-' + id);
    $trigger.find('span:first-child').text(field.labelText || field.placeholder);
    if (value) $trigger.addClass('has-value');
    else $trigger.removeClass('has-value');
    return this;
  };

  // ── getValue: lấy giá trị 1 field ────────────────────────────────────
  FormSelect.prototype.getValue = function (id) {
    var field = this._fields[id];
    if (!field) return '';
    if (field.type === 'list') return field.value || '';
    return ($('#fs-' + id).val() || '').trim();
  };

  // ── getValues: lấy tất cả giá trị ────────────────────────────────────
  FormSelect.prototype.getValues = function () {
    var result = {};
    for (var id in this._fields) {
      result[id] = this.getValue(id);
    }
    return result;
  };

  // ── onListChange: callback khi list value thay đổi ────────────────────
  FormSelect.prototype.onListChange = function (id, fn) {
    var field = this._fields[id];
    if (field) field.onChange = fn;
    return this;
  };

  // ── reset: reset tất cả về mặc định ──────────────────────────────────
  FormSelect.prototype.reset = function () {
    for (var id in this._fields) {
      var field = this._fields[id];
      if (field.type === 'input') {
        $('#fs-' + id).val(field.inputType === 'date' ? '' : '');
      } else {
        field.value = '';
        field.labelText = '';
        var $trigger = $('#fs-' + id);
        $trigger.find('span:first-child').text(field.placeholder);
        $trigger.removeClass('has-value');
      }
    }
    return this;
  };

  // ── clearCache: xóa cache cho 1 hoặc tất cả field ────────────────────
  FormSelect.prototype.clearCache = function (id) {
    if (id) delete this._caches[id];
    else this._caches = {};
    return this;
  };

  return FormSelect;
})();
