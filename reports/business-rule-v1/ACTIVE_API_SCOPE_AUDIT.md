# Audit tín hiệu scope của API active trên medtest

**Thời điểm:** 2026-07-19T09:17:22.088Z

**Kết quả:** STATIC_SCOPE_SIGNAL_AUDIT_COMPLETE — 24 API READ active.

> Đây là audit tĩnh trên definition đang chạy, không phải bằng chứng đầy đủ rằng dữ liệu đúng phạm vi. Tín hiệu có mặt chỉ chứng minh code có marker; reviewer vẫn phải chạy cross-user/cross-branch/cross-store.

| API | Procedure | Scope status | Username | Branch | Customer function | Warehouse | Dynamic SQL |
|---|---|---|---:|---:|---:|---:|---:|
| `@cham_diem_kh` | `API_ChamDiemKH_AI` | `CUSTOMER_AND_BRANCH_SCOPE_SIGNALS` | Y | Y | Y | N | N |
| `@cong_no_chi_tiet` | `API_CongNoChiTiet_AI` | `CUSTOMER_AND_BRANCH_SCOPE_SIGNALS` | Y | Y | Y | N | N |
| `@cong_no_khach_hang` | `API_CongNoKhachHang_AI` | `CUSTOMER_AND_BRANCH_SCOPE_SIGNALS` | Y | Y | Y | N | N |
| `@danh_muc` | `API_DanhMuc_AI` | `USERNAME_ONLY_REVIEW_REQUIRED` | Y | N | N | N | N |
| `@danh_sach_cau_hoi_khao_sat` | `API_DanhSachCauHoiKhaoSat_AI` | `USERNAME_ONLY_REVIEW_REQUIRED` | Y | N | N | N | N |
| `@danh_sach_tonkho` | `API_DanhSachTonKho_AI` | `WAREHOUSE_AND_BRANCH_SCOPE_SIGNALS` | Y | Y | N | Y | N |
| `@de_xuat_khuyen_mai` | `API_DeXuatKhuyenMai_AI` | `WAREHOUSE_AND_BRANCH_SCOPE_SIGNALS` | Y | Y | N | Y | N |
| `@doanh_so` | `API_DoanhSo_AI` | `BRANCH_SCOPE_SIGNAL` | Y | Y | N | N | N |
| `@don_hang` | `API_DonHang_AI` | `BRANCH_SCOPE_SIGNAL` | Y | Y | N | N | N |
| `@goi_ydon_hang` | `API_GoiYDonHang_AI` | `CUSTOMER_AND_BRANCH_SCOPE_SIGNALS` | Y | Y | Y | N | N |
| `@goi_ydon_thuoc` | `API_GoiYDonThuoc_AI` | `CUSTOMER_SCOPE_WITHOUT_EXPLICIT_BRANCH_SIGNAL` | Y | N | Y | N | N |
| `@hoa_don` | `API_HoaDon_AI` | `BRANCH_SCOPE_SIGNAL` | Y | Y | N | N | N |
| `@hoa_don_chi_tiet` | `API_HoaDonChiTiet_AI` | `WAREHOUSE_AND_BRANCH_SCOPE_SIGNALS` | Y | Y | N | Y | N |
| `@khao_sat360` | `API_KhaoSat360_AI` | `USERNAME_ONLY_REVIEW_REQUIRED` | Y | N | N | N | N |
| `@kiem_tra_khao_sat` | `API_KiemTraKhaoSat_AI` | `USERNAME_ONLY_REVIEW_REQUIRED` | Y | N | N | N | N |
| `@kiem_tra_khao_sat_ngay` | `API_KiemTraKhaoSatNgay_AI` | `BRANCH_SCOPE_SIGNAL` | Y | Y | N | N | N |
| `@lich_su_khao_sat` | `API_LichSuKhaoSat_AI` | `BRANCH_SCOPE_SIGNAL` | Y | Y | N | N | N |
| `@san_pham_trong_tam` | `API_SanPhamTrongTam_AI` | `BRANCH_SCOPE_SIGNAL` | Y | Y | N | N | N |
| `@thong_bao` | `API_ThongBao_AI` | `USERNAME_ONLY_REVIEW_REQUIRED` | Y | N | N | N | N |
| `@tich_luy` | `API_TichLuy_AI` | `CUSTOMER_AND_BRANCH_SCOPE_SIGNALS` | Y | Y | Y | N | N |
| `@tim_san_pham_theo_trieu_chung` | `API_TimSanPhamTheoTrieuChung_AI` | `USERNAME_ONLY_REVIEW_REQUIRED` | Y | N | N | N | N |
| `@tra_cuu_san_pham` | `API_TraCuuSanPham_AI` | `USERNAME_ONLY_REVIEW_REQUIRED` | Y | N | N | N | N |
| `@tuyen_ban_hang` | `API_TuyenBanHang_AI` | `CUSTOMER_AND_BRANCH_SCOPE_SIGNALS` | Y | Y | Y | N | N |
| `@upsell_goi_y` | `API_UpsellGoiY_AI` | `CUSTOMER_AND_BRANCH_SCOPE_SIGNALS` | Y | Y | Y | Y | N |

## Mục phải review thủ công

- `@danh_muc` / `API_DanhMuc_AI`: `USERNAME_ONLY_REVIEW_REQUIRED`.
- `@danh_sach_cau_hoi_khao_sat` / `API_DanhSachCauHoiKhaoSat_AI`: `USERNAME_ONLY_REVIEW_REQUIRED`.
- `@doanh_so` / `API_DoanhSo_AI`: `BRANCH_SCOPE_SIGNAL`.
- `@don_hang` / `API_DonHang_AI`: `BRANCH_SCOPE_SIGNAL`.
- `@goi_ydon_thuoc` / `API_GoiYDonThuoc_AI`: `CUSTOMER_SCOPE_WITHOUT_EXPLICIT_BRANCH_SIGNAL`.
- `@hoa_don` / `API_HoaDon_AI`: `BRANCH_SCOPE_SIGNAL`.
- `@khao_sat360` / `API_KhaoSat360_AI`: `USERNAME_ONLY_REVIEW_REQUIRED`.
- `@kiem_tra_khao_sat` / `API_KiemTraKhaoSat_AI`: `USERNAME_ONLY_REVIEW_REQUIRED`.
- `@kiem_tra_khao_sat_ngay` / `API_KiemTraKhaoSatNgay_AI`: `BRANCH_SCOPE_SIGNAL`.
- `@lich_su_khao_sat` / `API_LichSuKhaoSat_AI`: `BRANCH_SCOPE_SIGNAL`.
- `@san_pham_trong_tam` / `API_SanPhamTrongTam_AI`: `BRANCH_SCOPE_SIGNAL`.
- `@thong_bao` / `API_ThongBao_AI`: `USERNAME_ONLY_REVIEW_REQUIRED`.
- `@tim_san_pham_theo_trieu_chung` / `API_TimSanPhamTheoTrieuChung_AI`: `USERNAME_ONLY_REVIEW_REQUIRED`.
- `@tra_cuu_san_pham` / `API_TraCuuSanPham_AI`: `USERNAME_ONLY_REVIEW_REQUIRED`.

## Quy tắc sử dụng báo cáo

- Không nâng `*_SCOPE_SIGNALS` thành Security PASS chỉ dựa vào regex.
- API customer-bound phải test một khách đúng scope và một khách khác branch.
- API warehouse-bound phải test kho của Sale, kho nhân viên thuộc Manager và kho ngoài scope.
- API có dynamic SQL phải chứng minh procedure/parameter không thể bị caller điều khiển ngoài metadata allowlist.
- Nếu procedure không có `@Username`, owner phải tuyên bố rõ đó là catalog global an toàn hoặc bổ sung verified identity.
