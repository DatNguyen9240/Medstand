/**
 * ============================================================
 *  MEDSTAND — CẤU HÌNH HỆ THỐNG (UNIFIED CONFIG)
 *  File này là file DUY NHẤT cần sửa khi deploy sang server mới
 * ============================================================
 */

// 1. Tham số môi trường (Environment Variables)
// Đã chuyển toàn bộ thông tin nhạy cảm về Server Proxy để giấu hoàn toàn khỏi trình duyệt F12
const ENV_VARS = {
    N8N_BASE: 'http://localhost:5678', // Local n8n instance
    API_BASE: '', // Chạy qua Server Proxy nội bộ (ẩn link backend thật)
    CHAT_API_KEY: '' // Khóa bí mật do Server Proxy tự động chèn ở phía backend
};



// 2. Cấu hình API chi tiết (Dữ liệu gốc từ api.config.js)
window.API_CONFIG = {
    BASE_URL: ENV_VARS.API_BASE,
    N8N_BASE: ENV_VARS.N8N_BASE,
    CHAT_API_KEY: ENV_VARS.CHAT_API_KEY,
    GATEWAY_URL: '/api/gateway', // Cổng API Gateway hợp nhất bảo mật

    ENDPOINTS: {
        AUTH: {
            LOGIN: '/api/login',
            LOGOUT: '/api/logout',
            USER_INFO: '/api/API_UserInfo',
            UPDATE_FIREBASE_TOKEN: '/api/API_UsertokenFirebase',
            CHANGE_PASSWORD: '/api/changepassword',
            UPDATE_USER: '/api/API_UpdateUser',
            REGISTER: '/api/API_UserRegister',
        },
        CUSTOMER: {
            CREATE: '/api/API_KhachHang_Insert',
            UPDATE: '/api/API_KhachHang_Update',
        },
        DASHBOARD: {
            STATS: '/api/Dashboard/Stats',
            REVENUE: '/api/Dashboard/Revenue',
            CHART1: '/api/API_DoanhSo_AI',
            CHART2: '/api/API_Dashboard_Chart2',
            BIRTHDAYS: '/api/API_Dashboard_SinhNhat_AI',
            INFORMATIONS: '/api/API_Dashboard_ThongTin',
        },
        ROUTES: {
            YOUR_ROUTES: '/api/API_TuyenCuaBan',
            CARE_RECOMMENDATIONS: '/api/API_TuyenBanHang_AI',
            ROUTE_STATUSES: '/api/API_TrangThaiTuyen',
        },
        ORDERS: {
            LIST: '/api/API_DonHang_AI',
            CREATE: '/api/API_DonHang_Insert',
            UPDATE: '/api/API_DonHang_Update',
            DELETE: '/api/API_DonHang_Delete',
            DETAIL: '/api/API_DonHangChiTiet',
            DELETE_DETAIL: '/api/API_DonHangChiTiet_Delete',
            INSERT_DETAIL: '/api/API_DonHangChiTiet_Insert',
            UPDATE_DETAIL: '/api/API_DonHangChiTiet_Update',
            THONG_KE_SO_LUONG: '/api/API_ThongKeSoLuong',
            SAVE_DRAFT: '/api/API_LuuDonNhap',
        },
        INVOICES: { LIST: '/api/API_HoaDon' },
        RETURNS: {
            LIST: '/api/API_PhieuTraHang',
            DETAIL: '/api/API_PhieuTraHangChiTiet',
        },
        SALES: {
            LIST: '/api/API_DoanhSo',
            PLAN: '/api/API_KeHoachBanHang',
        },
        CONTRACT_POINT: { LIST: '/api/API_DiemHopDong' },
        SURVEY: {
            START: '/api/API_BatDauBaiKhaoSat',
            QUESTIONS: '/api/API_ChiTietBaiKhaoSat',
            SUBMIT_QUIZ: '/api/API_NopBaiKhaoSat',
            RESULTS: '/api/API_KetQuaBaiKhaoSat',
            HISTORY: '/api/API_LichSuBaiKhaoSat',
            CHECK_DAILY: '/api/API_KiemTraKhaoSatNgay',
        },
        PRODUCT_WARNING: { LIST: '/api/API_SanPhamCanhBao' },
        NOTIFICATION: { LIST: '/api/API_ThongBao' },
        FILTER: {
            BRANCHES: '/api/API_ChiNhanhList',
            CUSTOMERS: '/api/API_KhachHangList',
            PRODUCTS: '/api/API_HangHoaList',
            STATUSES: '/api/API_OrderStatusList',
            PROVINCES: '/api/API_TinhThanh',
            DISTRICTS: '/api/API_QuanHuyen',
            WARDS: '/api/API_PhuongXa',
            CUSTOMER_GROUPS: '/api/API_NhomKhachHang',
            CHANNELS: '/api/API_KenhBan',
            ROUTE_DAYS: '/api/API_ThuDiTuyen',
        },
        AI: {
            CATALOG: '/api/API_DanhMuc_AI',
            ADMIN_UPLOAD: '/webhook/admin-upload',

            // CORE-001 — nguồn dữ liệu cho ô "Nhóm đối tượng" của khung tạo khách trong chat.
            //
            // ObjectGroupID là khoá phân quyền: AR_GetObjectByUserFnc lọc phạm vi khách
            // hoàn toàn theo cột này (không dùng BranchID). Gán sai giá trị thì khách vừa
            // tạo sẽ nằm ngoài tầm nhìn của chính người tạo, hoặc rơi vào sổ của bộ phận khác.
            //
            // Hai endpoint dưới đây chỉ nhận username từ phiên đăng nhập và tự suy EmployeeID
            // phía server. Không dùng API_NhomKhachHang cho việc này: nó lọc theo EmployeeID
            // do client gửi lên, và truyền rỗng thì trả về toàn bộ nhóm của hệ thống.
            OBJECT_GROUP_BY_USER: '/api/API_ObjectGroupByUser_AI',  // nhóm mà người đăng nhập được gán
            EMPLOYEE_BY_MANAGER: '/api/API_EmployeeByManager_AI',    // nhân viên dưới quyền, để manager chỉ định người phụ trách
            CREATE_CUSTOMER: '/api/API_KhachHang_Insert_AI'          // endpoint tạo khách riêng của Chatbot AI
        }
    },

    CHAT_WEBHOOK: '/webhook/hook-ai-dainao',
    CATALOG_ROOT_API: '@danh_muc',
    CART_CUSTOMER_DS: '@danh_muc|@Type=khachhang|@timkiem={q}',
    ENTITY_LOOKUP_DS: '@danh_muc|@timkiem={q}',

    DEBT_WARN_THRESHOLD: 50000000,
    RETURN_KEYWORDS: ['trả', 'lỗi', 'hỏng'],
    MSG_DEBT_RETURN: 'Có giao dịch trả hàng → Kiểm tra chất lượng SP trước khi giao.',
    MSG_DEBT_HIGH: 'Công nợ vượt ngưỡng → Ưu tiên đôn đốc thu hồi trước khi xuất đơn mới.',
    MSG_DEBT_ZERO: 'Thanh toán đúng hạn → Đề xuất đẩy mạnh up-sale.',
    MSG_DEBT_NORMAL: 'Giao dịch đều đặn → Duy trì chăm sóc khách hàng thường xuyên.',
};

// Đảm bảo biến có thể truy cập trực tiếp bằng tên trong tất cả các scope
var API_CONFIG = window.API_CONFIG;

// Alias legacy cho các hệ thống cũ (nơi vẫn dùng APP_ENV)
window.APP_ENV = {
    N8N_BASE: ENV_VARS.N8N_BASE,
    API_BASE: ENV_VARS.API_BASE
};
var APP_ENV = window.APP_ENV;

// Đóng băng config
Object.freeze(window.API_CONFIG);
Object.freeze(window.API_CONFIG.ENDPOINTS);
