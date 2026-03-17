/**
 * Dashboard Schema
 * Định nghĩa cấu trúc dữ liệu mapping từ API sang UI
 */
const DASHBOARD_SCHEMA = {
  // Thống kê (Stats Cards)
  STATS: [
    { key: 'DonHang', label: 'Đơn hàng', icon: '' },
    { key: 'KhachHangGD', label: 'Khách hàng giao dịch', icon: '' },
    { key: 'TyLe', label: 'Độ phủ ngành hàng', icon: '' }
  ],

  // Danh sách sinh nhật
  BIRTHDAY: {
    // Thứ tự các trường sẽ hiển thị trong phần nội dung
    displayFields: [
      { key: 'ObjectName', cssClass: 'list-title', placeholder: 'Không rõ tên' },
      { key: 'ADDRESS', cssClass: 'list-subtitle' },
      { key: 'Birthday', cssClass: 'list-subtitle', icon: '🎂', style: 'color:var(--color-primary);font-size:0.75rem' }
    ],
    // Trường dùng cho nút gọi
    phoneKey: 'Phone'
  },

  // Biểu đồ (Nếu cần config nhãn biểu đồ)
  CHART: {
    label: 'Doanh số',
    borderColor: '#3c50e0',
    backgroundColor: 'rgba(60, 80, 224, 0.1)'
  }
};

// Đóng băng để tránh bị ghi đè
Object.freeze(DASHBOARD_SCHEMA);
Object.freeze(DASHBOARD_SCHEMA.STATS);
Object.freeze(DASHBOARD_SCHEMA.BIRTHDAY);
