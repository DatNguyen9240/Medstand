/**
 * API Configuration
 * Thay đổi BASE_URL ở đây để chuyển môi trường (dev/staging/prod)
 */
const API_CONFIG = {
  // DEV: chạy proxy.js → node proxy.js rồi dùng http://localhost:8080
  // PROD: đổi lại thành http://medmb.bms79.com
  BASE_URL: 'https://medtest.bms79.com',

  // ─── Endpoints theo domain ─────────────────────────────────────────────────
  ENDPOINTS: {

    // Auth / User
    AUTH: {
      LOGIN: '/api/login',
      LOGOUT: '/logout',
      USER_INFO: '/api/API_UserInfo',
      UPDATE_FIREBASE_TOKEN: '/api/API_UsertokenFirebase',
      CHANGE_PASSWORD: '/api/changepassword',
      UPDATE_USER: '/api/API_UpdateUser',
      REGISTER: '/api/API_UserRegister',
    },

    // Khách hàng
    CUSTOMER: {
      CREATE: '/api/API_KhachHang_Insert',
      UPDATE: '/api/API_KhachHang_Update',
    },

    // Trang chủ / Dashboard
    DASHBOARD: {
      STATS: '/api/Dashboard/Stats',
      REVENUE: '/api/Dashboard/Revenue',
      CHART1: '/api/API_Dashboard_Chart1',
      CHART2: '/api/API_Dashboard_Chart2',
      BIRTHDAYS: '/api/API_Dashboard_SinhNhat',
      INFORMATIONS: '/api/API_Dashboard_ThongTin',
    },

    // Tuyến
    ROUTES: {
      YOUR_ROUTES: '/api/API_TuyenCuaBan',
      ROUTE_STATUSES: '/api/API_TrangThaiTuyen',
    },

    // Đơn hàng
    ORDERS: {
      LIST: '/api/API_DonHang',
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

    // Hóa đơn
    INVOICES: {
      LIST: '/api/API_HoaDon',
    },

    // Phiếu trả hàng
    RETURNS: {
      LIST: '/api/API_PhieuTraHang',
      DETAIL: '/api/API_PhieuTraHangChiTiet',
    },

    // Doanh số
    SALES: {
      LIST: '/api/API_DoanhSo',
      PLAN: '/api/API_KeHoachBanHang',
    },

    // Điểm hợp đồng
    CONTRACT_POINT: {
      LIST: '/api/API_DiemHopDong',
    },

    // Khảo sát
    SURVEY: {
      START: '/api/API_BatDauBaiKhaoSat',
      QUESTIONS: '/api/API_ChiTietBaiKhaoSat',
      SUBMIT_QUIZ: '/api/API_NopBaiKhaoSat',
      RESULTS: '/api/API_KetQuaBaiKhaoSat',
      HISTORY: '/api/API_LichSuBaiKhaoSat',
      CHECK_DAILY: '/api/API_KiemTraKhaoSatNgay',
    },

    // Sản phẩm cảnh báo
    PRODUCT_WARNING: {
      LIST: '/api/API_SanPhamCanhBao',
    },

    // Khách hàng
    CUSTOMER: {
      CREATE: '/api/API_KhachHang_Insert',
      UPDATE: '/api/API_KhachHang_Update',
    },

    // Thông báo
    NOTIFICATION: {
      LIST: '/api/API_ThongBao',
    },

    // Filter / lookup
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

    // AI Chatbot
    AI: {
      CATALOG: '/api/API_DanhMuc_AI',
    },
  },
};

// Đóng băng để tránh bị ghi đè ngoài ý muốn
Object.freeze(API_CONFIG);
Object.freeze(API_CONFIG.ENDPOINTS);
