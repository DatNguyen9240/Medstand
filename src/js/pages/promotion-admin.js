(function () {
  var user = JSON.parse(localStorage.getItem('auth_user') || '{}');
  var _programs = [];
  var _rules = [];
  var _selectedProgramId = null;
  var _selectedStatus = null;
  var _isNewEntry = true;

  var RULE_TYPE_HINT = {
    QUANTITY_DISCOUNT: 'Cần: Số lượng tối thiểu + % giảm giá.',
    QUANTITY_GIFT: 'Cần: Số lượng tối thiểu + sản phẩm/quà tặng + số lượng tặng.',
    AMOUNT_DISCOUNT: 'Cần: Giá trị đơn hàng tối thiểu (của sản phẩm này) + % giảm giá.',
    AMOUNT_GIFT: 'Cần: Giá trị đơn hàng tối thiểu (của sản phẩm này) + sản phẩm/quà tặng + số lượng tặng.',
    INFORMATION: 'Chỉ cần mô tả (không tự tính giá/tặng).'
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showMessage(text, isError) {
    var $msg = $('#promo-admin-message');
    $msg.text(text || '').toggleClass('is-error', !!isError);
  }

  function statusBadgeClass(status) {
    return { DRAFT: 'is-draft', APPROVED: 'is-approved', REJECTED: 'is-rejected', WITHDRAWN: 'is-withdrawn', EXPIRED: 'is-expired' }[status] || '';
  }
  function statusLabel(status) {
    return { DRAFT: 'Nháp', APPROVED: 'Đã duyệt', REJECTED: 'Đã từ chối', WITHDRAWN: 'Đã thu hồi', EXPIRED: 'Hết hạn' }[status] || status || '-';
  }

  // EffectiveFrom/EffectiveTo được gửi lên dạng UTC ISO (.toISOString()). Server lưu DATETIME2
  // không có múi giờ, nên tuỳ gateway mà chuỗi trả về có thể thiếu hậu tố 'Z'/offset — nếu thiếu,
  // JS sẽ hiểu nhầm thành giờ local và làm ngày hiệu lực lệch mỗi lần tải lại. Luôn coi chuỗi
  // không có múi giờ là UTC (thêm 'Z') để round-trip nhất quán với lúc lưu.
  function toDatetimeLocalValue(isoOrDate) {
    if (!isoOrDate) return '';
    var value = String(isoOrDate);
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value) && !/[Zz]$|[+-]\d{2}:?\d{2}$/.test(value)) {
      value = value.replace(' ', 'T') + 'Z';
    }
    var d = new Date(value);
    if (isNaN(d.getTime())) return '';
    var pad = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  // ── Danh sách chương trình ────────────────────────────────────────────
  function loadList() {
    $('#promo-list').html('<p class="promo-empty">Đang tải danh sách...</p>');
    Http.get(API_CONFIG.ENDPOINTS.PROMOTION_ADMIN.LIST, {
      q: JSON.stringify({ Username: user.UserName || '', Status: '', SearchText: '' })
    }).then(function (res) {
      var body = res && res.data !== undefined ? res.data : res;
      var records = (body && body.records) || body || [];
      if (records.length && records[0].MsgType === 1) { showMessage(records[0].Msg, true); _programs = []; }
      else _programs = records;
      renderList();
    }).catch(function () {
      showMessage('Không thể tải danh sách CTBH.', true);
      $('#promo-list').html('<p class="promo-empty">Lỗi tải dữ liệu.</p>');
    });
  }

  function renderList() {
    var $list = $('#promo-list');
    if (!_programs.length) { $list.html('<p class="promo-empty">Chưa có chương trình nào.</p>'); return; }
    $list.html(_programs.map(function (p) {
      var sel = String(p.PromotionProgramID) === String(_selectedProgramId) ? ' is-selected' : '';
      return '<div class="promo-item' + sel + '" data-id="' + p.PromotionProgramID + '">' +
        '<strong>' + escapeHtml(p.PromotionCode) + ' — v' + p.ProgramVersion + '</strong>' +
        '<span>' + escapeHtml(p.PromotionName) + '</span>' +
        '<small>' + statusLabel(p.Status) + ' · ' + (p.RuleCount || 0) + ' điều kiện</small>' +
        '</div>';
    }).join(''));
  }

  // ── Chi tiết / form ────────────────────────────────────────────────────
  function resetForm() {
    _selectedProgramId = null;
    _selectedStatus = null;
    _isNewEntry = true;
    _rules = [];
    $('#pf-code').val('').prop('readonly', false);
    $('#pf-name').val('');
    $('#pf-type').val('MONTHLY');
    $('#pf-priority').val(100);
    $('#pf-from').val('');
    $('#pf-to').val('');
    $('#pf-source').val('');
    $('#pf-desc').val('');
    $('#pf-vat-basis').val('INCLUSIVE_UNIT_PRICE_NO_GIFT_VAT');
    $('#pf-max-benefit-per-order').val('');
    $('#pf-branch-scope').val('ALL').trigger('change');
    $('#pf-group-scope').val('ALL').trigger('change');
    $('#pf-branch-ids').val('');
    $('#pf-group-ids').val('');
    setFormEditable(true);
    updateActionButtons();
    renderRules();
    $('.promo-item').removeClass('is-selected');
  }

  function setFormEditable(editable) {
    $('#promo-editor input, #promo-editor select, #promo-editor textarea').prop('disabled', !editable);
    $('#pf-code').prop('readonly', !_isNewEntry);
    $('#btn-add-rule, #btn-save-draft-promo').toggle(!!editable);
  }

  function updateActionButtons() {
    var $badge = $('#promo-status-badge');
    if (!_selectedStatus) { $badge.text(''); }
    else { $badge.text(statusLabel(_selectedStatus)).attr('class', 'promo-status-badge ' + statusBadgeClass(_selectedStatus)); }

    $('#btn-approve-promo, #btn-reject-promo').toggle(_selectedStatus === 'DRAFT');
    $('#btn-withdraw-promo').toggle(_selectedStatus === 'APPROVED');
  }

  function selectProgram(id) {
    Http.get(API_CONFIG.ENDPOINTS.PROMOTION_ADMIN.DETAIL, {
      q: JSON.stringify({ PromotionProgramID: id, Username: user.UserName || '' })
    }).then(function (res) {
      var body = res && res.data !== undefined ? res.data : res;
      var rows = (body && body.records) || body || [];
      if (rows.length && rows[0].MsgType === 1) { showMessage(rows[0].Msg, true); return; }
      if (!rows.length) { showMessage('Không tìm thấy chi tiết chương trình.', true); return; }

      var header = rows[0];
      _selectedProgramId = header.PromotionProgramID;
      _selectedStatus = header.Status;
      _isNewEntry = false;

      $('#pf-code').val(header.PromotionCode).prop('readonly', true);
      $('#pf-name').val(header.PromotionName);
      $('#pf-type').val(header.ProgramType);
      $('#pf-priority').val(header.Priority);
      $('#pf-from').val(toDatetimeLocalValue(header.EffectiveFrom));
      $('#pf-to').val(toDatetimeLocalValue(header.EffectiveTo));
      $('#pf-source').val(header.SourceDocument);
      $('#pf-desc').val(header.Description || '');
      $('#pf-vat-basis').val(header.VatBasis || 'INCLUSIVE_UNIT_PRICE_NO_GIFT_VAT');
      $('#pf-max-benefit-per-order').val(header.MaxTotalBenefitAmountPerOrder != null ? header.MaxTotalBenefitAmountPerOrder : '');
      $('#pf-branch-scope').val(header.BranchScopeMode).trigger('change');
      $('#pf-group-scope').val(header.UserGroupScopeMode).trigger('change');
      $('#pf-branch-ids').val(header.BranchIDs || '');
      $('#pf-group-ids').val(header.UserGroupIDs || '');

      _rules = rows.filter(function (r) { return r.PromotionItemRuleID; }).map(function (r, i) {
        return {
          RuleOrder: r.RuleOrder || (i + 1), ItemID: r.ItemID, ItemName: r.ItemName, RuleType: r.RuleType,
          MinimumQuantity: r.MinimumQuantity, MaximumQuantity: r.MaximumQuantity,
          MinimumOrderAmount: r.MinimumOrderAmount, MaximumOrderAmount: r.MaximumOrderAmount,
          DiscountPercent: r.DiscountPercent, GiftItemID: r.GiftItemID, GiftItemName: r.GiftItemName,
          GiftQuantity: r.GiftQuantity, BenefitDescription: r.BenefitDescription
        };
      });

      setFormEditable(header.Status === 'DRAFT');
      updateActionButtons();
      renderRules();
      renderList();
    }).catch(function () { showMessage('Không thể tải chi tiết chương trình.', true); });
  }

  // ── Rule rows ──────────────────────────────────────────────────────────
  function blankRule() {
    return { RuleOrder: _rules.length + 1, ItemID: '', ItemName: '', RuleType: 'AMOUNT_DISCOUNT' };
  }

  function renderRules() {
    var $c = $('#promo-rules-list');
    if (!_rules.length) { $c.html('<p class="promo-empty">Chưa có điều kiện nào.</p>'); return; }
    $c.html(_rules.map(function (r, i) {
      var opts = ['QUANTITY_DISCOUNT', 'QUANTITY_GIFT', 'AMOUNT_DISCOUNT', 'AMOUNT_GIFT', 'INFORMATION'].map(function (t) {
        return '<option value="' + t + '"' + (r.RuleType === t ? ' selected' : '') + '>' + t + '</option>';
      }).join('');
      return '<div class="promo-rule-row" data-index="' + i + '">' +
        '<div class="promo-rule-item-search"><label>Sản phẩm (ItemID)' +
        '<input type="text" class="rule-item-id" value="' + escapeHtml(r.ItemID) + '" placeholder="Gõ tên/mã để tìm">' +
        '<div class="promo-item-suggestions" style="display:none"></div></label></div>' +
        '<label>Loại điều kiện<select class="rule-type">' + opts + '</select></label>' +
        '<label>SL tối thiểu<input type="number" class="rule-min-qty" value="' + (r.MinimumQuantity != null ? r.MinimumQuantity : '') + '"></label>' +
        '<label>SL tối đa<input type="number" class="rule-max-qty" value="' + (r.MaximumQuantity != null ? r.MaximumQuantity : '') + '"></label>' +
        '<label>Giá trị tối thiểu<input type="number" class="rule-min-amt" value="' + (r.MinimumOrderAmount != null ? r.MinimumOrderAmount : '') + '"></label>' +
        '<label>Giá trị tối đa<input type="number" class="rule-max-amt" value="' + (r.MaximumOrderAmount != null ? r.MaximumOrderAmount : '') + '"></label>' +
        '<label>% giảm giá<input type="number" step="0.01" class="rule-discount" value="' + (r.DiscountPercent != null ? r.DiscountPercent : '') + '"></label>' +
        '<label>Mã SP tặng<input type="text" class="rule-gift-item" value="' + escapeHtml(r.GiftItemID) + '"></label>' +
        '<label>SL tặng<input type="number" class="rule-gift-qty" value="' + (r.GiftQuantity != null ? r.GiftQuantity : '') + '"></label>' +
        '<label class="promo-full">Mô tả quyền lợi<input type="text" class="rule-benefit" value="' + escapeHtml(r.BenefitDescription) + '"></label>' +
        '<small class="promo-full" style="color:var(--color-text-muted)">' + (RULE_TYPE_HINT[r.RuleType] || '') + '</small>' +
        '<button type="button" class="promo-rule-remove">Xóa</button>' +
        '</div>';
    }).join(''));
  }

  function syncRuleField(index, field, value) {
    if (_rules[index]) _rules[index][field] = value;
  }

  $(document).on('click', '#btn-add-rule', function () { _rules.push(blankRule()); renderRules(); });
  $(document).on('click', '.promo-rule-remove', function () {
    var i = Number($(this).closest('.promo-rule-row').attr('data-index'));
    _rules.splice(i, 1);
    renderRules();
  });
  $(document).on('input', '.rule-item-id', function () { syncRuleField(Number($(this).closest('.promo-rule-row').attr('data-index')), 'ItemID', $(this).val()); });
  $(document).on('change', '.rule-type', function () {
    var i = Number($(this).closest('.promo-rule-row').attr('data-index'));
    syncRuleField(i, 'RuleType', $(this).val());
    $(this).closest('.promo-rule-row').find('small').text(RULE_TYPE_HINT[$(this).val()] || '');
  });
  $(document).on('input', '.rule-min-qty', function () { syncRuleField(Number($(this).closest('.promo-rule-row').attr('data-index')), 'MinimumQuantity', $(this).val()); });
  $(document).on('input', '.rule-max-qty', function () { syncRuleField(Number($(this).closest('.promo-rule-row').attr('data-index')), 'MaximumQuantity', $(this).val()); });
  $(document).on('input', '.rule-min-amt', function () { syncRuleField(Number($(this).closest('.promo-rule-row').attr('data-index')), 'MinimumOrderAmount', $(this).val()); });
  $(document).on('input', '.rule-max-amt', function () { syncRuleField(Number($(this).closest('.promo-rule-row').attr('data-index')), 'MaximumOrderAmount', $(this).val()); });
  $(document).on('input', '.rule-discount', function () { syncRuleField(Number($(this).closest('.promo-rule-row').attr('data-index')), 'DiscountPercent', $(this).val()); });
  $(document).on('input', '.rule-gift-item', function () { syncRuleField(Number($(this).closest('.promo-rule-row').attr('data-index')), 'GiftItemID', $(this).val()); });
  $(document).on('input', '.rule-gift-qty', function () { syncRuleField(Number($(this).closest('.promo-rule-row').attr('data-index')), 'GiftQuantity', $(this).val()); });
  $(document).on('input', '.rule-benefit', function () { syncRuleField(Number($(this).closest('.promo-rule-row').attr('data-index')), 'BenefitDescription', $(this).val()); });

  // Gợi ý sản phẩm khi gõ ItemID (tái dùng API catalog giống create-order.js)
  var _itemSearchTimer = null;
  function searchProductCatalog(keyword) {
    return Http.get(API_CONFIG.ENDPOINTS.AI.CATALOG, {
      q: JSON.stringify({ Username: user.UserName || '', Type: 'sanpham', timkiem: keyword || '' })
    }).then(function (res) {
      var body = res && res.data !== undefined ? res.data : res;
      var rows = (body && body.records) || body || [];
      return rows.map(function (item) {
        return { value: item.MaDanhMuc || item.ItemID || '', name: item.Name || item.ItemName || item.MaDanhMuc || item.ItemID || '' };
      }).filter(function (item) { return item.value && item.name; });
    });
  }
  $(document).on('input', '.rule-item-id', function () {
    var $input = $(this);
    var $box = $input.siblings('.promo-item-suggestions');
    var keyword = $input.val().trim();
    clearTimeout(_itemSearchTimer);
    if (keyword.length < 2) { $box.hide().empty(); return; }
    _itemSearchTimer = setTimeout(function () {
      searchProductCatalog(keyword).then(function (items) {
        if (!items.length) { $box.hide().empty(); return; }
        $box.html(items.slice(0, 20).map(function (it) {
          return '<div data-value="' + escapeHtml(it.value) + '">' + escapeHtml(it.value) + ' — ' + escapeHtml(it.name) + '</div>';
        }).join('')).show();
      });
    }, 300);
  });
  $(document).on('click', '.promo-item-suggestions div', function () {
    var $row = $(this).closest('.promo-rule-row');
    var val = $(this).attr('data-value');
    $row.find('.rule-item-id').val(val);
    syncRuleField(Number($row.attr('data-index')), 'ItemID', val);
    $(this).parent().hide().empty();
  });
  $(document).on('click', function (e) {
    if (!$(e.target).closest('.promo-rule-item-search').length) $('.promo-item-suggestions').hide();
  });

  // ── Scope toggle ─────────────────────────────────────────────────────
  $(document).on('change', '#pf-branch-scope', function () { $('#pf-branch-ids-wrap').toggle($(this).val() === 'INCLUDE'); });
  $(document).on('change', '#pf-group-scope', function () { $('#pf-group-ids-wrap').toggle($(this).val() === 'INCLUDE'); });

  // ── Save / Approve ───────────────────────────────────────────────────
  function splitIds(value) {
    return String(value || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function buildRulesPayload() {
    return _rules.map(function (r, i) {
      return {
        RuleOrder: i + 1,
        ItemID: r.ItemID,
        RuleType: r.RuleType,
        MinimumQuantity: r.MinimumQuantity === '' || r.MinimumQuantity == null ? null : Number(r.MinimumQuantity),
        MaximumQuantity: r.MaximumQuantity === '' || r.MaximumQuantity == null ? null : Number(r.MaximumQuantity),
        MinimumOrderAmount: r.MinimumOrderAmount === '' || r.MinimumOrderAmount == null ? null : Number(r.MinimumOrderAmount),
        MaximumOrderAmount: r.MaximumOrderAmount === '' || r.MaximumOrderAmount == null ? null : Number(r.MaximumOrderAmount),
        DiscountPercent: r.DiscountPercent === '' || r.DiscountPercent == null ? null : Number(r.DiscountPercent),
        GiftItemID: r.GiftItemID || '',
        GiftQuantity: r.GiftQuantity === '' || r.GiftQuantity == null ? null : Number(r.GiftQuantity),
        BenefitDescription: r.BenefitDescription || null
      };
    });
  }

  $(document).on('click', '#btn-save-draft-promo', function () {
    var code = $('#pf-code').val().trim();
    var name = $('#pf-name').val().trim();
    var source = $('#pf-source').val().trim();
    var from = $('#pf-from').val();
    var to = $('#pf-to').val();
    if (!code || !name || !source || !from || !to) {
      Alert.error('Vui lòng nhập đủ Mã CTBH, Tên chương trình, Nguồn tài liệu và Hiệu lực từ/đến.');
      return;
    }
    if (!_rules.length) { Alert.error('Cần ít nhất 1 điều kiện áp dụng.'); return; }

    var payload = {
      PromotionProgramID: _isNewEntry ? null : _selectedProgramId,
      PromotionCode: code,
      PromotionName: name,
      ProgramType: $('#pf-type').val(),
      Description: $('#pf-desc').val() || null,
      EffectiveFrom: new Date(from).toISOString(),
      EffectiveTo: new Date(to).toISOString(),
      BranchScopeMode: $('#pf-branch-scope').val(),
      JsonBranchIDs: JSON.stringify(splitIds($('#pf-branch-ids').val())),
      UserGroupScopeMode: $('#pf-group-scope').val(),
      JsonUserGroupIDs: JSON.stringify(splitIds($('#pf-group-ids').val())),
      Priority: Number($('#pf-priority').val() || 100),
      SourceDocument: source,
      JsonRules: JSON.stringify(buildRulesPayload()),
      Username: user.UserName || '',
      Apply: 1,
      VatBasis: $('#pf-vat-basis').val() || 'INCLUSIVE_UNIT_PRICE_NO_GIFT_VAT',
      MaxTotalBenefitAmountPerOrder: $('#pf-max-benefit-per-order').val() === '' ? null : Number($('#pf-max-benefit-per-order').val())
    };

    var $btn = $(this).prop('disabled', true);
    Http.post(API_CONFIG.ENDPOINTS.PROMOTION_ADMIN.UPSERT, payload).then(function (res) {
      var body = res && res.data !== undefined ? res.data : res;
      var row = Array.isArray(body) ? body[0] : (body && body.records ? body.records[0] : body);
      if (row && row.MsgType === 1) { Alert.error(row.Msg || 'Không thể lưu CTBH.'); return; }
      Alert.success((row && row.Msg) || 'Đã lưu DRAFT.');
      loadList();
      if (row && row.PromotionProgramID) selectProgram(row.PromotionProgramID);
    }).catch(function () {
      Alert.error('Không thể lưu CTBH. Vui lòng thử lại.');
    }).finally(function () { $btn.prop('disabled', false); });
  });

  function runApproveAction(action, confirmText) {
    if (!_selectedProgramId) return;
    if (!window.confirm(confirmText)) return;
    Http.post(API_CONFIG.ENDPOINTS.PROMOTION_ADMIN.APPROVE, {
      PromotionProgramID: _selectedProgramId, Action: action, Username: user.UserName || '', Apply: 1
    }).then(function (res) {
      var body = res && res.data !== undefined ? res.data : res;
      var row = Array.isArray(body) ? body[0] : (body && body.records ? body.records[0] : body);
      if (row && row.MsgType === 1) { Alert.error(row.Msg || 'Thao tác thất bại.'); return; }
      Alert.success((row && row.Msg) || 'Đã cập nhật trạng thái.');
      loadList();
      selectProgram(_selectedProgramId);
    }).catch(function () { Alert.error('Không thể thực hiện thao tác. Vui lòng thử lại.'); });
  }

  $(document).on('click', '#btn-approve-promo', function () { runApproveAction('APPROVE', 'Duyệt chương trình này? CTBH sẽ có hiệu lực thật ngay khi nằm trong khoảng thời gian hiệu lực.'); });
  $(document).on('click', '#btn-reject-promo', function () { runApproveAction('REJECT', 'Từ chối bản DRAFT này?'); });
  $(document).on('click', '#btn-withdraw-promo', function () { runApproveAction('WITHDRAW', 'Thu hồi chương trình đã duyệt này? CTBH sẽ ngừng hiệu lực ngay.'); });

  $(document).on('click', '#btn-new-promo', resetForm);
  $(document).on('click', '#btn-refresh-promo-list', loadList);
  $(document).on('click', '.promo-item', function () { selectProgram($(this).attr('data-id')); });

  resetForm();
  loadList();
})();
