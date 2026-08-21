(function () {
  var LIMIT = 20;
  var searchText = '';
  var _loadSeq = 0; // Chặn kết quả trả về chậm của lần gọi cũ đè lên kết quả mới hơn

  // Init filter ngay lập tức
  new FilterComponent({
    container: '#filter-container',
    fields: [],
    onApply: function (values) { loadPage(1); },
    onSearch: function (keyword) { searchText = keyword; loadPage(1); }
  });

  TotalBar.init({ onPageChange: function (page) { loadPage(page); } });

  function escAttr(s) { return String(s || '').replace(/"/g, '&quot;'); }

  function displayDate(value) {
    if (!value) return '-';
    var match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? match[3] + '/' + match[2] + '/' + match[1] : value;
  }

  function renderCustomer(c) {
    var phone = c.Phone || c.phone || '';
    return '<div class="customer-card" style="cursor:pointer" ' +
      'data-id="' + escAttr(c.ObjectID) + '" ' +
      'data-name="' + escAttr(c.ObjectName) + '" ' +
      'data-address="' + escAttr(c.Address) + '" ' +
      'data-phone="' + escAttr(phone) + '" ' +
      'data-tax="' + escAttr(c.TaxCode) + '" ' +
      'data-birthday="' + escAttr(c.Birthday) + '" ' +
      'data-loaikhachhang="' + escAttr(c.LoaiKhachHang) + '" ' +
      'data-kenhban="' + escAttr(c.KenhBan) + '" ' +
      'data-thudituyien="' + escAttr(c.ThuDiTuyen) + '" ' +
      'data-objectgroupid="' + escAttr(c.ObjectGroupID) + '" ' +
      'data-objectgroupname="' + escAttr(c.ObjectGroupName) + '" ' +
      'data-bankacc="' + escAttr(c.AccountNoHD) + '" ' +
      'data-bank="' + escAttr(c.AccountNameHD) + '" ' +
      'data-bankowner="' + escAttr(c.ChuTaiKhoan) + '" ' +
      'data-branchid="' + escAttr(c.BranchID) + '" ' +
      'data-locationid="' + escAttr(c.LocationID) + '" ' +
      'data-quanhuyen="' + escAttr(c.QuanHuyen) + '" ' +
      'data-xaphuong="' + escAttr(c.XaPhuong) + '" ' +
      'data-lat="' + (c.Latitude || 0) + '" ' +
      'data-lng="' + (c.Longitude || 0) + '" ' +
      '>' +
      '<div class="name">' + (c.ObjectName || c.name || '-') + '</div>' +
      '<div class="row">Địa chỉ: ' + (c.Address || c.address || '-') + '</div>' +
      '<div class="row">SĐT: ' + (phone || '-') + '</div>' +
      '<div class="row">Sinh nhật: ' + displayDate(c.Birthday || c.birthday) + '</div>' +
      '<div class="row">Tuyến thứ: ' + (c.ThuDiTuyen || '-') + '</div>' +
      '<div class="row">Trạng thái: ' + (c.StatusName || c.status || '-') + '</div>' +
      (phone ? '<a href="tel:' + phone + '" class="btn-call" onclick="event.stopPropagation()">📞</a>' : '') +
      '</div>';
  }

  function loadPage(page) {
    $('#customer-list').prop('hidden', true);
    $('#skeleton').prop('hidden', false);
    var user = JSON.parse(localStorage.getItem('auth_user') || '{}');
    var requestSeq = ++_loadSeq;
    Http.get(API_CONFIG.ENDPOINTS.FILTER.CUSTOMERS, {
      q: JSON.stringify({
        User: user.UserName || '',
        ManagerID: '',
        EmployeeID: '',
        ObjectID: '',
        LoaiKhachHang: '',
        KenhBan: '',
        SearchText: searchText,
        SYSManagerID: user.ManagerID || '',
        SYSEmployeeID: user.EmployeeID || '',
        page: page,
        limit: LIMIT
      })
    })
      .then(function (res) {
        if (requestSeq !== _loadSeq) return; // Có lần gọi mới hơn đã thay thế, bỏ kết quả cũ này
        var data = res.data || res;
        var customers = data.records || data || [];
        var firstCustomer = customers[0] || {};
        var totalRows = data.total || data.TotalRows || data._recordtotal || firstCustomer.TotalRows || customers.length;
        var totalPages = data.pagetotal || data.PageTotal || data._pagetotal || firstCustomer.PageTotal || Math.ceil(totalRows / LIMIT) || 1;
        TotalBar.show({ currentPage: page, totalPages: totalPages });
        $('#skeleton').prop('hidden', true);
        var $list = $('#customer-list');
        $list.prop('hidden', false);
        $list.html(customers.length ? customers.map(renderCustomer).join('') : '<p style="text-align:center;color:var(--color-text-muted);padding:48px 0;grid-column:1/-1">Không có khách hàng</p>');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch(function () {
        if (requestSeq !== _loadSeq) return;
        $('#skeleton').prop('hidden', true);
        $('#customer-list').prop('hidden', false).html('<p style="text-align:center;color:var(--color-text-muted);padding:48px 0;grid-column:1/-1">Không tải được dữ liệu</p>');
      });
  }

  // loadPage(1) triggered by FilterComponent auto-apply
})();

var _editingObjectID = '';
var _districtsCache = {};
var _wardsCache = {};
var _updateSubmitKey = '';
var _updateSubmitFingerprint = '';

function customerUpdateIdempotencyKey(payload) {
  var fingerprint = JSON.stringify(payload || {});
  if (!_updateSubmitKey || _updateSubmitFingerprint !== fingerprint) {
    var randomPart = (window.crypto && typeof window.crypto.randomUUID === 'function')
      ? window.crypto.randomUUID()
      : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    _updateSubmitKey = 'customer-update-' + randomPart;
    _updateSubmitFingerprint = fingerprint;
  }
  return _updateSubmitKey;
}

// -- Build form using FormSelect component -----------------------------------
var custForm = new FormSelect({ container: '#customerFormContainer' });
var user = JSON.parse(localStorage.getItem('auth_user') || '{}');

custForm
  .addInput({ id: 'name', label: 'Tên khách hàng', required: true, placeholder: 'Tên khách hàng' })
  .addInput({ id: 'phone', label: 'Số điện thoại', required: true, type: 'tel', placeholder: 'Số điện thoại' })
  .addInput({ id: 'birthday', label: 'Ngày sinh', placeholder: 'dd/mm/yyyy' })
  .addInput({ id: 'tax', label: 'Mã số thuế', placeholder: 'Mã số thuế' })
  .addList({
    id: 'type', label: 'Loại khách hàng', required: true, placeholder: 'Loại khách hàng',
    loadFn: function (done) {
      done([
        { value: 'OTC', label: 'OTC' },
        { value: 'ETC', label: 'ETC' }
      ]);
    }
  })
  .addInput({ id: 'bankAcc', label: 'Số tài khoản ngân hàng', placeholder: 'Số tài khoản ngân hàng' })
  .addInput({ id: 'bankOwner', label: 'Chủ ngân hàng', placeholder: 'Chủ ngân hàng' })
  .addInput({ id: 'bank', label: 'Ngân hàng', placeholder: 'Ngân hàng' })
  .addList({
    id: 'province', label: 'Tỉnh/Thành phố', required: true, placeholder: 'Tỉnh/Thành phố',
    loadFn: function (done) {
      Http.get(API_CONFIG.ENDPOINTS.FILTER.PROVINCES, {
        q: JSON.stringify({ User: user.UserName || '', LocationID: '', SearchText: '' })
      }).then(function (res) {
        var records = (res.data || res).records || res.data || res || [];
        done(records.map(function (r) { return { value: r.LocationID || '', label: r.LocationName || r.LocationID || '' }; }));
      }).catch(function () { done([]); });
    }
  })
  .addList({
    id: 'district', label: 'Quận/Huyện', required: true, placeholder: 'Quận/Huyện', autoload: false,
    loadFn: function (done) {
      var prov = custForm.getValue('province');
      if (!prov) { Alert.warning('Vui lòng chọn Tỉnh/Thành phố trước.'); done([]); return; }
      if (_districtsCache[prov]) return done(_districtsCache[prov]);
      Http.get(API_CONFIG.ENDPOINTS.FILTER.DISTRICTS, {
        q: JSON.stringify({ User: user.UserName || '', LocationID: prov, QuanHuyen: '', SearchText: '' })
      }).then(function (res) {
        var records = (res.data || res).records || res.data || res || [];
        _districtsCache[prov] = records.map(function (r) { return { value: r.QuanHuyen || '', label: r.QuanHuyen || '' }; });
        done(_districtsCache[prov]);
      }).catch(function () { done([]); });
    }
  })
  .addList({
    id: 'ward', label: 'Phường/Xã', required: true, placeholder: 'Phường/Xã', autoload: false,
    loadFn: function (done) {
      var prov = custForm.getValue('province');
      if (!prov) { Alert.warning('Vui lòng chọn Tỉnh/Thành phố trước.'); done([]); return; }
      var dist = custForm.getValue('district');
      var key = prov + '|' + dist;
      if (_wardsCache[key]) return done(_wardsCache[key]);
      Http.get(API_CONFIG.ENDPOINTS.FILTER.WARDS, {
        q: JSON.stringify({ User: user.UserName || '', LocationID: prov, QuanHuyen: dist, XaPhuong: '', SearchText: '' })
      }).then(function (res) {
        var records = (res.data || res).records || res.data || res || [];
        _wardsCache[key] = records.map(function (r) { return { value: r.XaPhuong || '', label: r.XaPhuong || '' }; });
        done(_wardsCache[key]);
      }).catch(function () { done([]); });
    }
  })
  .addInput({ id: 'address', label: 'Địa chỉ', required: true, placeholder: 'Địa chỉ' })
  .addList({
    id: 'branch', label: 'Chi nhánh', required: true, placeholder: 'Chi nhánh',
    locked: !!user.BranchID,
    loadFn: function (done) {
      Http.get(API_CONFIG.ENDPOINTS.FILTER.BRANCHES, { q: JSON.stringify({ BranchID: '', SearchText: '' }) })
        .then(function (res) {
          var records = (res.data || res).records || res.data || res || [];
          var opts = records.map(function (r) { return { value: r.BranchID || '', label: r.BranchName || r.BranchID || '' }; });
          done(opts);
          if (user.BranchID && !custForm.getValue('branch')) {
            var match = opts.find(function (o) { return o.value === user.BranchID; });
            if (match) custForm.setListValue('branch', match.value, match.label);
          }
        }).catch(function () { done([]); });
    }
  })
  .addList({
    id: 'group', label: 'Nhóm đối tượng', required: true, placeholder: 'Nhóm đối tượng',
    loadFn: function (done) {
      Http.get(API_CONFIG.ENDPOINTS.FILTER.CUSTOMER_GROUPS, {
        q: JSON.stringify({ User: user.UserName || '', ObjectGroupID: '', ManagerID: user.ManagerID || '', EmployeeID: user.EmployeeID || '', SearchText: '' })
      }).then(function (res) {
        var records = (res.data || res).records || res.data || res || [];
        done(records.map(function (r) { return { value: r.ObjectGroupID || '', label: r.ObjectGroupName || r.ObjectGroupID || '' }; }));
      }).catch(function () { done([]); });
    }
  })
  .addList({
    id: 'channel', label: 'Kênh bán', required: true, placeholder: 'Kênh bán',
    loadFn: function (done) {
      Http.get(API_CONFIG.ENDPOINTS.FILTER.CHANNELS, { q: JSON.stringify({ KenhBan: '' }) })
        .then(function (res) {
          var records = (res.data || res).records || res.data || res || [];
          done(records.map(function (r) { return { value: r.KenhBan || '', label: r.TenKenhBan || r.KenhBan || '' }; }));
        }).catch(function () { done([]); });
    }
  })
  .addList({
    id: 'route', label: 'Tuyến thứ', required: true, placeholder: 'Tuyến thứ',
    loadFn: function (done) {
      Http.get(API_CONFIG.ENDPOINTS.FILTER.ROUTE_DAYS, { q: JSON.stringify({ ThuDiTuyen: '' }) })
        .then(function (res) {
          var records = (res.data || res).records || res.data || res || [];
          done(records.map(function (r) { return { value: r.ThuTrongTuan || '', label: r.ThuTrongTuan || '' }; }));
        }).catch(function () { done([]); });
    }
  })
  .addInput({ id: 'gps', label: 'Vị trí GPS', placeholder: 'Nhập tọa độ hoặc chọn bản đồ' });

// Cascade: province ? reset district + ward
custForm.onListChange('province', function () {
  // Xóa cache nội bộ của FormSelect để nó gọi lại loadFn khi mở picker
  var distField = custForm._fields['district'];
  var wardField = custForm._fields['ward'];
  if (distField) distField._cachedOptions = null;
  if (wardField) wardField._cachedOptions = null;

  custForm.setListValue('district', '', '');
  custForm.setListValue('ward', '', '');
});



// GPS: thêm nút bản đồ bên cạnh input
var $gpsInput = $('#fs-gps');
$gpsInput.wrap('<div style="display:flex;gap:8px;align-items:center;width:100%"></div>');
$gpsInput.css('flex', '1');
$gpsInput.after(
  '<button type="button" id="btn-open-map" style="flex-shrink:0;width:44px;height:44px;border:1.5px solid var(--color-primary);border-radius:var(--radius-md);background:var(--color-surface);cursor:pointer;display:flex;align-items:center;justify-content:center;">' +
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
  '</button>'
);

var _branchName = ''; // Lưu tên chi nhánh để điền lại sau reset
var _branchNames = {};
Http.get(API_CONFIG.ENDPOINTS.FILTER.BRANCHES, { q: JSON.stringify({ BranchID: user.BranchID || '', SearchText: '' }) })
  .then(function (res) {
    var records = (res.data || res).records || res.data || res || [];
    records.forEach(function (r) { if (r.BranchID) _branchNames[r.BranchID] = r.BranchName || r.BranchID; });
    var match = records.find(function (r) { return r.BranchID === user.BranchID; });
    if (match) _branchName = match.BranchName || match.BranchID;
  });

function openModal(editData) {
  custForm.reset();
  custForm.setLocked('group', false);
  custForm.setLocked('bankAcc', false);
  custForm.setLocked('bankOwner', false);
  custForm.setLocked('bank', false);
  // Sau reset, nếu user có BranchID thì điền lại name và lock
  if (user.BranchID) {
    custForm.setListValue('branch', user.BranchID, _branchName);
    custForm.setLocked('branch', true);
  }
  if (editData) {
    _editingObjectID = editData.id;
    $('#modal-add-customer .modal-header h2').text('Cập nhật khách hàng');
    $('#btn-confirm-customer').text('CẬP NHẬT');
    custForm.setValue('name', editData.name || '');
    custForm.setValue('phone', editData.phone || '');
    custForm.setValue('address', editData.address || '');
    custForm.setValue('tax', editData.tax || '');
    custForm.setValue('bankAcc', editData.bankAcc || '');
    custForm.setValue('bankOwner', editData.bankOwner || '');
    custForm.setValue('bank', editData.bank || '');
    if (editData.birthday) {
      var bd = editData.birthday;
      if (bd.indexOf('-') !== -1 || bd.indexOf('T') !== -1) {
        var d = new Date(bd);
        if (!isNaN(d.getTime())) bd = ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
      }
      custForm.setValue('birthday', bd);
    }
    if (editData.lat && editData.lng && (editData.lat !== '0' || editData.lng !== '0'))
      custForm.setValue('gps', editData.lat + ',' + editData.lng);
    custForm.setListValue('type', editData.loaiKhachHang, editData.loaiKhachHang);
    custForm.setListValue('channel', editData.kenhBan, editData.kenhBan);
    custForm.setListValue('route', editData.thuDiTuyen, editData.thuDiTuyen);
    custForm.setListValue('province', editData.locationId, editData.locationId);
    custForm.setListValue('district', editData.quanHuyen, editData.quanHuyen);
    custForm.setListValue('ward', editData.xaPhuong, editData.xaPhuong);
    custForm.setListValue('group', editData.objectGroupId, editData.objectGroupName || editData.objectGroupId);
    if (editData.branchId) {
      custForm.setListValue('branch', editData.branchId, _branchNames[editData.branchId] || editData.branchId);
    }
    // The current update contract cannot change customer scope or bank fields.
    custForm.setLocked('group', true);
    custForm.setLocked('bankAcc', true);
    custForm.setLocked('bankOwner', true);
    custForm.setLocked('bank', true);
  } else {
    _editingObjectID = '';
    $('#modal-add-customer .modal-header h2').text('Thêm khách hàng');
    $('#btn-confirm-customer').text('XÁC NHẬN');
  }
  $('#modal-add-customer').addClass('active');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  $('#modal-add-customer').removeClass('active');
  document.body.style.overflow = '';
}

$('#btn-add-customer').on('click', function () { openModal(); });
$('#modal-close').on('click', closeModal);

$(document).on('click', '.customer-card', function (e) {
  if ($(e.target).closest('.btn-call').length) return;
  var $c = $(this);
  openModal({
    id: $c.data('id'), name: $c.data('name'), address: $c.data('address'),
    phone: $c.data('phone'), tax: $c.data('tax'), birthday: $c.data('birthday'),
    loaiKhachHang: $c.data('loaikhachhang'), kenhBan: $c.data('kenhban'),
    thuDiTuyen: $c.data('thudituyien'), locationId: $c.data('locationid'),
    quanHuyen: $c.data('quanhuyen'), xaPhuong: $c.data('xaphuong'),
    objectGroupId: $c.data('objectgroupid'), objectGroupName: $c.data('objectgroupname'),
    bankAcc: $c.attr('data-bankacc'), bank: $c.attr('data-bank'), bankOwner: $c.attr('data-bankowner'),
    branchId: $c.data('branchid'),
    lat: $c.data('lat'), lng: $c.data('lng'),
  });
});

$('#modal-add-customer').on('click', function (e) {
  if (e.target === this) closeModal();
});


$('#btn-confirm-customer').on('click', function () {
  var v = custForm.getValues();

  if (!v.name || !v.phone || !v.address || !v.branch) {
    Alert.warning('Vui lòng điền đủ các trường bắt buộc (*).', 'Thiếu thông tin');
    return;
  }

  var $btn = $(this);
  $btn.prop('disabled', true).text('Đang xử lý...');

  var lat = 0, lng = 0;
  if (v.gps) { var parts = v.gps.split(','); lat = parseFloat(parts[0]) || 0; lng = parseFloat(parts[1]) || 0; }

  var bdApi = '';
  if (v.birthday && v.birthday.length === 10) {
    var p = v.birthday.split('/');
    bdApi = p[2] + '-' + p[1] + '-' + p[0];
  }

  var isEdit = !!_editingObjectID;
  var endpoint = isEdit ? API_CONFIG.ENDPOINTS.CUSTOMER.UPDATE : API_CONFIG.ENDPOINTS.CUSTOMER.CREATE;
  var payload;

  var provinceName = (custForm._fields['province'] && custForm._fields['province'].labelText) || v.province;

  if (isEdit) {
    payload = {
      User: user.UserName || '', OldKeyID: _editingObjectID,
      ObjectName: v.name, Address: v.address,
      LocationID: v.province, QuanHuyen: v.district, XaPhuong: v.ward,
      Phone: v.phone, TaxCode: v.tax || '', Birthday: bdApi,
      LoaiKhachHang: v.type, KenhBan: v.channel,
      ThuDiTuyen: v.route, Latitude: lat, Longitude: lng,
    };
  } else {
    payload = {
      User: user.UserName || '', ObjectID: '',
      ObjectName: v.name, Address: v.address, Phone: v.phone,
      TaxCode: v.tax || '', Birthday: bdApi,
      LoaiKhachHang: v.type, KenhBan: v.channel,
      AccountNoHD: v.bankAcc || '', AccountNameHD: v.bank || '',
      ChuTaiKhoan: v.bankOwner || '', BranchID: v.branch,
      ObjectGroupID: v.group, LocationID: v.province,
      QuanHuyen: v.district, XaPhuong: v.ward,
      ThuDiTuyen: v.route, Latitude: lat, Longitude: lng,
    };
  }

  var requestOptions = isEdit ? { idempotencyKey: customerUpdateIdempotencyKey(payload) } : {};
  Http.post(endpoint, payload, requestOptions).then(function (res) {
    var data = res.data || res;
    // SP trả về: Msg, MsgType (5 = thành công, 1 = lỗi)
    var record = Array.isArray(data) ? data[0] : (data.records ? data.records[0] : data);
    var msg = record && record.Msg ? record.Msg : '';
    var msgType = record && record.MsgType !== undefined ? record.MsgType : 5;

    if (msgType == 1) {
      Alert.error(msg || 'Có lỗi xảy ra.');
      return;
    }

    if (isEdit) {
      _updateSubmitKey = '';
      _updateSubmitFingerprint = '';
    }
    closeModal();
    custForm.reset();
    Http.clearCache();
    // Reload danh sách
    document.querySelector('#filter-container .search-bar__input') &&
      document.querySelector('#filter-container .search-bar__input').dispatchEvent(new Event('input'));
    Alert.success(msg || (isEdit ? 'Cập nhật khách hàng thành công!' : 'Thêm khách hàng thành công!'));
  }).catch(function (err) {
    Alert.error(err.message || 'Có lỗi xảy ra.');
  }).finally(function () {
    $btn.prop('disabled', false).text(isEdit ? 'CẬP NHẬT' : 'XÁC NHẬN');
  });
});

// -- Map Picker ---------------------------------------------------------------
$(document).on('click', '#btn-open-map', function () {
  MapPicker.open(function (latlng) {
    custForm.setValue('gps', latlng);
  }, { value: custForm.getValue('gps') });
});
// -- Birthday auto-format dd/mm/yyyy ---------------------------------
$(document).on('input', '#fs-birthday', function () {
  var v = this.value.replace(/[^0-9]/g, '').substring(0, 8);
  if (v.length > 4) v = v.substring(0, 2) + '/' + v.substring(2, 4) + '/' + v.substring(4);
  else if (v.length > 2) v = v.substring(0, 2) + '/' + v.substring(2);
  this.value = v;
});

// -- Cleanup Hooks (Chống rò rỉ bộ nhớ) --------------------------------
window._pageCleanupHooks = window._pageCleanupHooks || [];
window._pageCleanupHooks.push(function() {
  $(document).off('click', '.customer-card');
  $(document).off('click', '#btn-open-map');
  $(document).off('input', '#fs-birthday');
});
