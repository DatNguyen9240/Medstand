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
    var value = opts.value || '';
    var placeholder = opts.placeholder || '';

    var html = (type === 'date')
      ? Input.renderDate({ id: 'fs-' + id, label: opts.label, value: value, required: opts.required, locked: opts.locked, readonly: opts.readonly })
      : Input.renderField({ id: 'fs-' + id, label: opts.label, value: value, type: type, placeholder: placeholder, required: opts.required, locked: opts.locked, readonly: opts.readonly });

    var $el = $(html);
    $el.attr('data-field', id);
    if (opts.full) $el.css('grid-column', '1/-1');

    this.$container.append($el);
    this._fields[id] = { type: 'input', inputType: type, label: opts.label, placeholder: placeholder, required: opts.required };
    
    if (opts.locked || opts.readonly) {
      this.setLocked(id, true);
    }
    
    return this;
  };

  // ── addList: thêm field chọn từ danh sách (modal picker) ──────────────
  FormSelect.prototype.addList = function (opts) {
    var id = opts.id;
    var placeholder = opts.placeholder || opts.label;

    var html = Input.renderSelect({ key: id, label: opts.label, value: placeholder, locked: opts.locked, required: opts.required });
    var $el = $(html);
    $el.attr('id', 'fs-trigger-' + id);
    $el.attr('data-field', id);      // ← cần để setListValue tìm được element
    if (opts.full) $el.css('grid-column', '1/-1');

    this.$container.append($el);

    this._fields[id] = {
      type: 'list',
      label: opts.label,
      placeholder: placeholder,
      loadFn: opts.loadFn,
      searchFn: opts.searchFn,
      value: '',
      labelText: ''
    };

    if (opts.locked) {
      this.setLocked(id, true);
    } else {
      // Bind click
      var self = this;
      $el.on('click', function () {
        self._openPicker(id);
      });
    }

    // autoload: gọi loadFn ngay khi init để pre-fill dữ liệu (edit mode)
    // Mặc định autoload = true nếu không truyền opts.autoload = false
    if (opts.autoload !== false && opts.loadFn) {
      var selfPreload = this;
      var fieldRef = this._fields[id];
      opts.loadFn(function(options) {
        fieldRef._cachedOptions = options;   // cache để picker dùng lại, không call API 2 lần
      });
    }

    return this;
  };

  // ── _openPicker: mở bottom-sheet modal chọn từ danh sách ─────────────
  FormSelect.prototype._openPicker = function (id) {
    var field = this._fields[id];
    if (!field || field.locked) return; // ← Chặn tuyệt đối khi bị khóa
    var $trigger = $('#fs-trigger-' + id);
    var self = this;

    function _renderModal(options) {
      var $text = $trigger.find('.filter-value-text');
      $text.text(field.labelText || field.placeholder);

      if (!options || options.length === 0) return;

      var html = '<div class="filter-modal-header">' +
        '<button type="button" class="filter-modal-close" aria-label="Đóng" id="picker-close">&times;</button>' +
        '<h3>' + field.label + '</h3>' +
        '</div>' +
        '<div style="padding:12px">' +
        Input.renderSearch({ id: 'picker-search', placeholder: 'Tìm kiếm' }) +
        '</div>' +
        '<ul class="select-modal-list" id="picker-list" style="max-height:50vh;overflow-y:auto;padding:0 12px">' +
        options.map(function (opt) {
          var val = (typeof opt === 'object') ? (opt.value || opt.ID || '') : opt;
          var lbl = (typeof opt === 'object') ? (opt.label || opt.Name || '') : opt;
          
          // So sánh không phân biệt chữ hoa thường và bỏ khoảng trắng thừa
          var isSelected = String(field.value).trim().toLowerCase() === String(val).trim().toLowerCase();
          var selected = isSelected ? ' class="selected"' : '';
          
          return '<li data-value="' + val + '"' + selected + '>' + lbl + '</li>';
        }).join('') +
        '</ul>';

      var $overlay = $('<div class="picker-overlay"></div>');
      var $sheet = $('<div class="picker-sheet"></div>').html(html);
      $overlay.append($sheet).appendTo('body');
      
      // Trigger animation
      setTimeout(function() {
        $overlay.addClass('active');
        $sheet.addClass('active');
      }, 10);

      // Close
      $overlay.find('#picker-close').on('click', function () { $overlay.remove(); });
      $overlay.on('click', function (e) { if (e.target === $overlay[0]) $overlay.remove(); });

      // Search
      var searchTimer = null;
      $overlay.find('#picker-search').on('input', function () {
        var kw = Format.removeAccents($(this).val());
        var rawKw = $(this).val().trim();
        $overlay.find('#picker-list li').each(function () {
          var text = Format.removeAccents($(this).text());
          $(this).css('display', text.indexOf(kw) !== -1 ? '' : 'none');
        });
        if (field.searchFn && rawKw.length >= 2) {
          clearTimeout(searchTimer);
          searchTimer = setTimeout(function () {
            field.searchFn(rawKw, function (remoteOptions) {
              $overlay.remove();
              _renderModal(remoteOptions || []);
              setTimeout(function () { $('#picker-search').val(rawKw).focus(); }, 0);
            });
          }, 300);
        }
      });

      // Select
      $overlay.find('#picker-list li').on('click', function () {
        var val = $(this).attr('data-value');
        var lbl = $(this).text();
        field.value = val;
        field.labelText = lbl;
        $text.text(lbl);
        $trigger.addClass('has-value');
        $overlay.remove();

        if (field.onChange) field.onChange(val, lbl);
      });
    }

    // Dùng cached options nếu đã autoload → không call API lần 2
    if (field._cachedOptions) {
      _renderModal(field._cachedOptions);
      return;
    }

    $trigger.find('.filter-value-text').text('Đang tải...');
    field.loadFn(function (options) {
      field._cachedOptions = options;   // cache lại
      _renderModal(options);
    });
  };

  // ── setValue: set giá trị cho input thường ─────────────────────────────
  FormSelect.prototype.setValue = function (id, value) {
    $('#fs-' + id).val(value);
    return this;
  };

  // ── setListValue: set giá trị cho list field ──────────────────────────
  FormSelect.prototype.setListValue = function (id, value, labelText) {
    var field = this._fields[id];
    if (field) {
      field.value = value;
      field.labelText = labelText || value;
      this.$container.find('[data-field="' + id + '"] .filter-value-text').text(field.labelText || field.placeholder);
      if (value) this.$container.find('[data-field="' + id + '"] .filter-select-item').addClass('has-value');
      else this.$container.find('[data-field="' + id + '"] .filter-select-item').removeClass('has-value');
    }
    if (field && field.onChange) field.onChange(value, labelText);
    return this;
  };

  FormSelect.prototype.setLocked = function (id, isLocked) {
    var field = this._fields[id];
    if (!field) return this;

    var $fieldWrap = this.$container.find('[data-field="' + id + '"]');
    var $label = $fieldWrap.find('label');

    if (field.type === 'list') {
      field.locked = isLocked;
      var $trigger = $fieldWrap.find('.filter-select-item');
      if (isLocked) {
        $fieldWrap.addClass('locked');
        $trigger.addClass('locked').removeClass('clickable');
        $trigger.find('.arrow').hide();
        $fieldWrap.off('click');
      } else {
        $fieldWrap.removeClass('locked');
        $trigger.removeClass('locked').addClass('clickable');
        $trigger.find('.arrow').show();
        var self = this;
        $fieldWrap.off('click').on('click', function () { self._openPicker(id); });
      }
    } else {
      field.locked = isLocked;
      var $input = $('#fs-' + id);
      if (isLocked) {
        $fieldWrap.addClass('locked');
        $input.prop('readonly', true);
      } else {
        $fieldWrap.removeClass('locked');
        $input.prop('readonly', false);
      }
    }
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
        var $trigger = $('#fs-trigger-' + id);
        $trigger.find('.filter-value-text').text(field.placeholder);
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
