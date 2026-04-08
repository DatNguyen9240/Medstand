import json

path = r'c:\Git cua tui\Medstand\HoangDang\n8n\K_SieuLuong.json'
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# --- JAVASCRIPT CHO PARSE INPUT CO BAN ---
JS_COBAN = """
const raw = $input.item.json;
const body = raw.body || raw;
const headers = raw.headers || {};
const ApiCode = (body.ApiCode || '').trim();
const isConfirm = parseInt(body.isConfirm || '0', 10);

if (!ApiCode) return [{ json: { loi: true, hop_le: false, message: 'Thieu ApiCode' } }];

let tokenStr = body.token || headers.authorization || headers.Authorization || headers.token || '';
if (tokenStr.startsWith('Bearer ')) tokenStr = tokenStr.split(' ')[1];

let realUsername = body.username || 'UNKNOWN';
let userRoles = ['USER'];
let isJwtParsed = false;

if (!tokenStr || tokenStr === 'Bearer empty' || tokenStr === 'empty' || tokenStr === 'null') {
   // Xử lý nới lỏng tạm thời cho bot tĩnh (nếu cần) hoặc chặn luôn
   // return [{ json: { loi: true, hop_le: false, message: 'Vui lòng đăng nhập lại để sử dụng chức năng!' } }];
} else {
    try {
      const parts = tokenStr.split('.');
      if (parts.length === 3) {
        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = Buffer.from(base64, 'base64').toString('utf-8');
        const payload = JSON.parse(jsonPayload);
        
        let r = payload.role || payload.Role || payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] || 'USER';
        if (Array.isArray(r)) userRoles = r.map(x => String(x).toUpperCase());
        else userRoles = String(r).toUpperCase().split(',');
        
        realUsername = payload.UserName || payload.username || payload.sub || payload.unique_name || payload.name || payload.Name || realUsername;
        isJwtParsed = true;
      }
    } catch(e) {
      console.log('JWT Error:', e.message);
    }
}

// Nếu realUsername = Demo hoặc UNKNOWN -> chưa auth
if (realUsername === 'Demo' || realUsername === 'UNKNOWN') {
    return [{ json: { loi: true, hop_le: false, message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng tải lại trang (F5) và đăng nhập lại!' } }];
}

// Chặn quyền
const MANAGER_APIS = ['@xem_doanh_so', '@import_trong_tam', '@de_xuat_khuyen_mai'];
if (MANAGER_APIS.includes(ApiCode)) {
   const isManager = userRoles.includes('ADMIN') || userRoles.includes('MANAGER') || userRoles.includes('CEO') || userRoles.includes('QUANLY');
   if (!isManager && isJwtParsed) {
      return [{ json: { loi: true, hop_le: false, message: '⛔ Từ chối truy cập: API [' + ApiCode + '] yêu cầu quyền Quản Lý. Bạn hiện là [' + userRoles.join(',') + '].' } }];
   }
}

// --- 2. BUILD SQL ---
let params = {};
if (typeof body.params === 'string') {
  try { params = JSON.parse(body.params); } catch(e) { params = {}; }
} else if (typeof body.params === 'object' && body.params !== null) {
  params = body.params;
}

function esc(val) {
  if (val === undefined || val === null || String(val).trim() === '') return 'NULL';
  let str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  return "N'" + str.replace(/'/g, "''") + "'";
}

let sql = '';
let isUpdate = false;

switch(ApiCode) {
    case '@tao_don_hang':
        isUpdate = true;
        sql = `EXEC API_DonHangChiTiet_Insert_AI @Username=${esc(realUsername)}, @DocumentID=${esc(params['@DocumentID'])}, @ObjectID=${esc(params['@ObjectID'])}, @ItemList=${esc(params['@ItemList'])};`;
        break;
    case '@them_khach_hang':
        isUpdate = true;
        sql = `EXEC API_ThemKhachHang_AI @Username=${esc(realUsername)}, @TenKhachHang=${esc(params['@TenKhachHang'])}, @SoDienThoai=${esc(params['@SoDienThoai'])}, @DiaChi=${esc(params['@DiaChi'])}, @ObjectGroupID=${esc(params['@ObjectGroupID'])};`;
        break;
    case '@xem_hoa_don':
        sql = `EXEC API_HoaDon_AI @Username=${esc(realUsername)}, @FromDate=${esc(params['@FromDate'])}, @ToDate=${esc(params['@ToDate'])}, @SearchText=${esc(params['@SearchText'])};`;
        break;
    case '@xem_don_hang':
        sql = `EXEC API_DonHang_AI @Username=${esc(realUsername)}, @FromDate=${esc(params['@FromDate'])}, @ToDate=${esc(params['@ToDate'])}, @StatusID=${esc(params['@StatusID'])}, @StatusName=${esc(params['@StatusName'])}, @EmployeeID=${esc(params['@EmployeeID'])}, @ObjectID=${esc(params['@ObjectID'])}, @SearchText=${esc(params['@SearchText'])}, @TopN=${esc(params['@TopN'])};`;
        break;
    case '@xem_doanh_so':
        sql = `EXEC API_DoanhSo_AI @Username=${esc(realUsername)}, @FromDate=${esc(params['@FromDate'])}, @ToDate=${esc(params['@ToDate'])}, @ObjectID=${esc(params['@ObjectID'])}, @ObjectName=${esc(params['@ObjectName'])}, @EmployeeID=${esc(params['@EmployeeID'])}, @EmployeeName=${esc(params['@EmployeeName'])}, @ItemName=${esc(params['@ItemName'])}, @TopN=${esc(params['@TopN'])};`;
        break;
    case '@cong_no_kh':
        sql = `EXEC API_CongNoKhachHang_AI @Username=${esc(realUsername)}, @ObjectID=${esc(params['@ObjectID'])}, @ToDate=${esc(params['@ToDate'])};`;
        break;
    case '@cong_no_chi_tiet':
        sql = `EXEC API_CongNoChiTiet_AI @Username=${esc(realUsername)}, @ObjectID=${esc(params['@ObjectID'])}, @ToDate=${esc(params['@ToDate'])};`;
        break;
    case '@danh_muc':
        sql = `EXEC API_DanhMuc_AI @Type=${esc(params['@Type'])}, @SearchText=${esc(params['@SearchText'])};`;
        break;
    case '@ton_kho_list':
        sql = `EXEC API_GetTonKho_List_AI @Username=${esc(realUsername)}, @ItemID=${esc(params['@ItemID'])}, @ItemName=${esc(params['@ItemName'])};`;
        break;
    case '@tra_cuu_san_pham':
        sql = `EXEC API_TraCuuSanPham_AI @SearchKey=${esc(params['@SearchKey'])}, @TopN=${esc(params['@TopN'])};`;
        break;
    default:
        return [{ json: { loi: true, hop_le: false, message: 'ApiCode Cơ Bản không được hỗ trợ: ' + ApiCode } }];
}

if (isUpdate && isConfirm === 0) {
    return [{ json: { hop_le: true, need_confirm: true, ApiCode, sql_query: null } }];
}

return [{ json: { hop_le: true, need_confirm: false, ApiCode, sql_query: sql } }];
""".strip()

# --- JAVASCRIPT CHO PARSE INPUT NANG CAO ---
JS_NANGCAO = JS_COBAN.replace("Parse Input Co Ban", "Parse Input Nang Cao").replace("""switch(ApiCode) {
    case '@tao_don_hang':""", """switch(ApiCode) {
    case '@goi_y_don_hang':
        sql = `EXEC API_GoiYDonHang_AI @Username=${esc(realUsername)}, @ObjectID=${esc(params['@ObjectID'])}, @TopN=${esc(params['@TopN'])};`;
        break;
    case '@upsell_goi_y':
        sql = `EXEC API_UpsellGoiY_AI @Username=${esc(realUsername)}, @ObjectID=${esc(params['@ObjectID'])}, @SearchKey=${esc(params['@SearchKey'])}, @TopN=${esc(params['@TopN'])};`;
        break;
    case '@goi_y_don_thuoc':
        sql = `EXEC API_GoiYDonThuoc_AI @Keyword=${esc(params['@Keyword'])};`;
        break;
    case '@tuyen_ban_hang':
        sql = `EXEC API_TuyenBanHang_AI @Username=${esc(realUsername)}, @ObjectID=${esc(params['@ObjectID'])}, @SoNgayVangMat=${esc(params['@SoNgayVangMat'])}, @TopN=${esc(params['@TopN'])};`;
        break;
    case '@cham_diem_kh':
        sql = `EXEC API_ChamDiemKH_AI @Username=${esc(realUsername)}, @ObjectID=${esc(params['@ObjectID'])}, @NhomFilter=${esc(params['@NhomFilter'])};`;
        break;
    case '@tich_luy':
        sql = `EXEC API_TichLuy_AI @Username=${esc(realUsername)}, @ObjectID=${esc(params['@ObjectID'])}, @ProgramID=${esc(params['@ProgramID'])}, @FromDate=${esc(params['@FromDate'])}, @ToDate=${esc(params['@ToDate'])}, @ItemIDs=${esc(params['@ItemIDs'])};`;
        break;
    case '@san_pham_trong_tam':
        sql = `EXEC API_SanPhamTrongTam_AI @Username=${esc(realUsername)}, @ObjectID=${esc(params['@ObjectID'])}, @TopN=${esc(params['@TopN'])};`;
        break;
    case '@de_xuat_khuyen_mai':
        sql = `EXEC API_DeXuatKhuyenMai_AI @Username=${esc(realUsername)};`;
        break;
    default:
        return [{ json: { loi: true, hop_le: false, message: 'ApiCode Nâng Cao không được hỗ trợ: ' + ApiCode } }];
}
// END_SWITCH""")
# Clean up extra stuff from string replace
import re
JS_NANGCAO = re.sub(r"EXEC API_DonHangChiTiet.*", "", JS_NANGCAO, flags=re.DOTALL)
JS_NANGCAO = JS_NANGCAO.replace('// END_SWITCH', '')


js_nang_cao_explicit = """
const raw = $input.item.json;
const body = raw.body || raw;
const headers = raw.headers || {};
const ApiCode = (body.ApiCode || '').trim();

if (!ApiCode) return [{ json: { loi: true, hop_le: false, message: 'Thieu ApiCode' } }];

let tokenStr = body.token || headers.authorization || headers.Authorization || headers.token || '';
if (tokenStr.startsWith('Bearer ')) tokenStr = tokenStr.split(' ')[1];

let realUsername = body.username || 'UNKNOWN';
let userRoles = ['USER'];
let isJwtParsed = false;

if (tokenStr && tokenStr !== 'Bearer empty' && tokenStr !== 'empty' && tokenStr !== 'null') {
    try {
      const parts = tokenStr.split('.');
      if (parts.length === 3) {
        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = Buffer.from(base64, 'base64').toString('utf-8');
        const payload = JSON.parse(jsonPayload);
        
        let r = payload.role || payload.Role || payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] || 'USER';
        if (Array.isArray(r)) userRoles = r.map(x => String(x).toUpperCase());
        else userRoles = String(r).toUpperCase().split(',');
        
        realUsername = payload.UserName || payload.username || payload.sub || payload.unique_name || payload.name || payload.Name || realUsername;
        isJwtParsed = true;
      }
    } catch(e) {}
}

if (realUsername === 'Demo' || realUsername === 'UNKNOWN') {
    return [{ json: { loi: true, hop_le: false, message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng tải lại trang (F5) và đăng nhập lại!' } }];
}

const MANAGER_APIS = ['@xem_doanh_so', '@import_trong_tam', '@de_xuat_khuyen_mai'];
if (MANAGER_APIS.includes(ApiCode)) {
   const isManager = userRoles.includes('ADMIN') || userRoles.includes('MANAGER') || userRoles.includes('CEO') || userRoles.includes('QUANLY');
   if (!isManager && isJwtParsed) {
      return [{ json: { loi: true, hop_le: false, message: '⛔ Từ chối truy cập: API [' + ApiCode + '] yêu cầu quyền Quản Lý. Bạn hiện là [' + userRoles.join(',') + '].' } }];
   }
}

let params = {};
if (typeof body.params === 'string') {
  try { params = JSON.parse(body.params); } catch(e) { params = {}; }
} else if (typeof body.params === 'object' && body.params !== null) {
  params = body.params;
}

function esc(val) {
  if (val === undefined || val === null || String(val).trim() === '') return 'NULL';
  let str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  return "N'" + str.replace(/'/g, "''") + "'";
}

let sql = '';
switch(ApiCode) {
    case '@goi_y_don_hang':
        sql = `EXEC API_GoiYDonHang_AI @Username=${esc(realUsername)}, @ObjectID=${esc(params['@ObjectID'])}, @TopN=${esc(params['@TopN'])};`;
        break;
    case '@upsell_goi_y':
        sql = `EXEC API_UpsellGoiY_AI @Username=${esc(realUsername)}, @ObjectID=${esc(params['@ObjectID'])}, @SearchKey=${esc(params['@SearchKey'])}, @TopN=${esc(params['@TopN'])};`;
        break;
    case '@goi_y_don_thuoc':
        sql = `EXEC API_GoiYDonThuoc_AI @Keyword=${esc(params['@Keyword'])};`;
        break;
    case '@tuyen_ban_hang':
        sql = `EXEC API_TuyenBanHang_AI @Username=${esc(realUsername)}, @ObjectID=${esc(params['@ObjectID'])}, @SoNgayVangMat=${esc(params['@SoNgayVangMat'])}, @TopN=${esc(params['@TopN'])};`;
        break;
    case '@cham_diem_kh':
        sql = `EXEC API_ChamDiemKH_AI @Username=${esc(realUsername)}, @ObjectID=${esc(params['@ObjectID'])}, @NhomFilter=${esc(params['@NhomFilter'])};`;
        break;
    case '@tich_luy':
        sql = `EXEC API_TichLuy_AI @Username=${esc(realUsername)}, @ObjectID=${esc(params['@ObjectID'])}, @ProgramID=${esc(params['@ProgramID'])}, @FromDate=${esc(params['@FromDate'])}, @ToDate=${esc(params['@ToDate'])}, @ItemIDs=${esc(params['@ItemIDs'])};`;
        break;
    case '@san_pham_trong_tam':
        sql = `EXEC API_SanPhamTrongTam_AI @Username=${esc(realUsername)}, @ObjectID=${esc(params['@ObjectID'])}, @TopN=${esc(params['@TopN'])};`;
        break;
    case '@de_xuat_khuyen_mai':
        sql = `EXEC API_DeXuatKhuyenMai_AI @Username=${esc(realUsername)};`;
        break;
    default:
        return [{ json: { loi: true, hop_le: false, message: 'ApiCode Nâng Cao không được hỗ trợ: ' + ApiCode } }];
}

return [{ json: { hop_le: true, need_confirm: false, ApiCode, sql_query: sql } }];
"""

for node in data['nodes']:
    name = node.get('name', '')
    if name == 'Parse Input Co Ban':
        node['parameters']['jsCode'] = JS_COBAN
    elif name == 'Parse Input Nang Cao':
        node['parameters']['jsCode'] = js_nang_cao_explicit

with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("Updated JWT patch to reject Demo users explicitly.")
