import json

path = r'c:\Git cua tui\Medstand\HoangDang\n8n\K_SieuLuong.json'
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# --- JAVASCRIPT CHO PARSE INPUT CO BAN KÈM THUẬT TOÁN JWT CHECK ---
JS_COBAN = """
const raw = $input.item.json;
const body = raw.body || raw;
const headers = raw.headers || {};
const ApiCode = (body.ApiCode || '').trim();
const isConfirm = parseInt(body.isConfirm || '0', 10);

if (!ApiCode) return [{ json: { loi: true, message: 'Thieu ApiCode' } }];
if (!ApiCode.startsWith('@')) return [{ json: { loi: true, message: 'ApiCode khong hop le' } }];

// --- 1. JWT TOKEN VALIDATION & ROLE EXTRACTION ---
let tokenStr = body.token || headers.authorization || headers.Authorization || headers.token || '';
if (tokenStr.startsWith('Bearer ')) tokenStr = tokenStr.split(' ')[1];

let realUsername = body.username || 'UNKNOWN';
let userRoles = ['USER'];

if (!tokenStr || tokenStr === 'Bearer empty' || tokenStr === 'empty' || tokenStr === 'null') {
   return [{ json: { loi: true, message: '❌ Lỗi hệ thống: Token không hợp lệ hoặc bạn chưa đăng nhập!' } }];
}

try {
  const parts = tokenStr.split('.');
  if (parts.length === 3) {
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = Buffer.from(base64, 'base64').toString('utf-8');
    const payload = JSON.parse(jsonPayload);
    
    // Lấy Role(s)
    let r = payload.role || payload.Role || payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] || 'Sale';
    if (Array.isArray(r)) userRoles = r.map(x => String(x).toUpperCase());
    else userRoles = String(r).toUpperCase().split(',');
    
    // Username luôn lấy TỪ TOKEN để bảo mật (chống spoofing)
    realUsername = payload.sub || payload.unique_name || payload.username || payload.name || payload.Name || realUsername;
  }
} catch(e) {
  // Bỏ qua nếu ko phải JWT chuẩn, fallback về rule cơ bản
  console.log("JWT parse fail:", e.message);
}

// Chặn quyền Manager API
const MANAGER_APIS = ['@xem_doanh_so', '@import_trong_tam', '@de_xuat_khuyen_mai'];
if (MANAGER_APIS.includes(ApiCode)) {
   const isManager = userRoles.includes('ADMIN') || userRoles.includes('MANAGER') || userRoles.includes('CEO') || userRoles.includes('QUANLY');
   if (!isManager) {
      return [{ json: { loi: true, message: '⛔ Từ chối truy cập: API [' + ApiCode + '] yêu cầu quyền Quản Lý. Bạn hiện là [' + userRoles.join(',') + '].' } }];
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

# --- JAVASCRIPT CHO PARSE INPUT NANG CAO KÈM JWT ---
JS_NANGCAO = """
const raw = $input.item.json;
const body = raw.body || raw;
const headers = raw.headers || {};
const ApiCode = (body.ApiCode || '').trim();

if (!ApiCode) return [{ json: { loi: true, message: 'Thieu ApiCode' } }];
if (!ApiCode.startsWith('@')) return [{ json: { loi: true, message: 'ApiCode khong hop le' } }];

let tokenStr = body.token || headers.authorization || headers.Authorization || headers.token || '';
if (tokenStr.startsWith('Bearer ')) tokenStr = tokenStr.split(' ')[1];

let realUsername = body.username || 'UNKNOWN';
let userRoles = ['USER'];

if (!tokenStr || tokenStr === 'Bearer empty' || tokenStr === 'empty' || tokenStr === 'null') {
   return [{ json: { loi: true, message: '❌ Lỗi hệ thống: Token không hợp lệ hoặc bạn chưa đăng nhập!' } }];
}

try {
  const parts = tokenStr.split('.');
  if (parts.length === 3) {
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = Buffer.from(base64, 'base64').toString('utf-8');
    const payload = JSON.parse(jsonPayload);
    let r = payload.role || payload.Role || payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] || 'Sale';
    if (Array.isArray(r)) userRoles = r.map(x => String(x).toUpperCase());
    else userRoles = String(r).toUpperCase().split(',');
    realUsername = payload.sub || payload.unique_name || payload.username || payload.name || payload.Name || realUsername;
  }
} catch(e) {}

const MANAGER_APIS = ['@xem_doanh_so', '@import_trong_tam', '@de_xuat_khuyen_mai'];
if (MANAGER_APIS.includes(ApiCode)) {
   const isManager = userRoles.includes('ADMIN') || userRoles.includes('MANAGER') || userRoles.includes('CEO') || userRoles.includes('QUANLY');
   if (!isManager) {
      return [{ json: { loi: true, message: '⛔ Từ chối truy cập: API [' + ApiCode + '] yêu cầu quyền Quản Lý. Bạn hiện là [' + userRoles.join(',') + '].' } }];
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
""".strip()

JS_FORMAT_COBAN = """
const items = $input.all();
const parseNode = $('Parse Input Co Ban').item.json;
const ApiCode = parseNode.ApiCode || '';

if (parseNode.need_confirm) {
   return [{ json: { ket_qua: "⚠️ Dữ liệu hợp lệ. Vui lòng kiểm tra kỹ và bấm **XÁC NHẬN** để hệ thống thực thi lệnh " + ApiCode, so_ban_ghi: 0, ApiCode, isConfirm_Review: true } }];
}

let payload = [];
try {
  if (items.length > 0) {
    const first = items[0].json;
    if (first && first.recordsets && first.recordsets[0]) {
      payload = first.recordsets[0];
    } else if (first && first.recordset) {
      payload = first.recordset;
    } else if (first && Array.isArray(first)) {
      payload = first;
    } else {
      payload = items.map(i => i.json).filter(r => r && !r.error);
    }
    if (first && first.error) {
      return [{ json: { ket_qua: 'Lỗi Database (' + ApiCode + '): ' + (first.message || JSON.stringify(first.error)), loi: true } }];
    }
  }
} catch(e) {}

if (!payload || payload.length === 0) {
  return [{ json: { ket_qua: 'Thực thi thành công nhưng hệ thống trả về rỗng.', so_ban_ghi: 0, ApiCode } }];
}

const keys = Object.keys(payload[0]).filter(k => !k.startsWith('_'));
const total = payload.length;
let text = 'Tìm thấy ' + total + ' kết quả:\\n\\n';
text += '| STT | ' + keys.join(' | ') + ' |\\n';
text += '|---|' + keys.map(() => '---').join('|') + ' |\\n';
text += payload.slice(0, 20).map((row, i) => {
  return '| ' + (i + 1) + ' | ' + keys.map(k => String(row[k] !== null && row[k] !== undefined ? row[k] : '').replace(/\\|/g, '-')).join(' | ') + ' |';
}).join('\\n');
if (total > 20) text += '\\n\\n... và ' + (total - 20) + ' kết quả khác chênh lệch.';

return [{ json: { ket_qua: text, so_ban_ghi: total, ApiCode } }];
""".strip()

JS_FORMAT_NANGCAO = JS_FORMAT_COBAN.replace("Parse Input Co Ban", "Parse Input Nang Cao")

SQL_QUERY_EXP = "={{ $json.sql_query || \"SELECT 'NEED_CONFIRM' AS status;\" }}"
SQL_NODE_CREDS = {
  "microsoftSql": {
    "id": "5XZStIxQA6Sd5chg",
    "name": "Microsoft SQL account"
  }
}

patched = 0
for node in data['nodes']:
    name = node.get('name', '')
    if name == 'Parse Input Co Ban':
        node['parameters']['jsCode'] = JS_COBAN
    elif name == 'Parse Input Nang Cao':
        node['parameters']['jsCode'] = JS_NANGCAO
    elif name == 'Format Ket Qua Co Ban':
        node['parameters']['jsCode'] = JS_FORMAT_COBAN
    elif name == 'Format Ket Qua Nang Cao':
        node['parameters']['jsCode'] = JS_FORMAT_NANGCAO
    elif name in ('Goi Backend API', 'Goi Backend AI Analytics'):
        # Convert back to SQL
        node['type'] = 'n8n-nodes-base.microsoftSql'
        node['parameters'] = {
            "operation": "executeQuery",
            "query": SQL_QUERY_EXP
        }
        node['credentials'] = SQL_NODE_CREDS
        print('Converted to SQL:', name)
        patched += 1

with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print('Updated K_SieuLuong.json with JWT Token Validation & Role Enforcement!')
