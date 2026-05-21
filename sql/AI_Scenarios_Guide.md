# 🤖 MEDSTAND AI — HƯỚNG DẪN KỊCH BẢN & API MAPPING

> Tài liệu này mô tả toàn bộ kịch bản người dùng có thể hỏi AI,
> và API SQL tương ứng cần gọi kèm tham số đầy đủ.
> AI đọc file này để biết cần EXEC procedure nào cho từng câu hỏi.

---

## THÔNG TIN CHUNG

| Tham số chung | Mô tả |
|---|---|
| `@Username` | Tên đăng nhập của người dùng (Sale/Manager/CEO) — **BẮT BUỘC** |
| `@MaKhachHang` | Mã khách hàng (lấy từ CF_ObjectTbl.ObjectID) — Tùy chọn |
| `@timkiem` | Từ khóa tìm kiếm dạng chuỗi hoặc triệu chứng — Tùy chọn |
| `@TopN` | Số kết quả trả về tối đa |

---

## MODULE 1 — AI GỢI Ý ĐƠN HÀNG
**Stored Procedure:** `API_GoiYDonHang_AI`

### Tham số
| Tham số | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `@Username` | VARCHAR(50) | '' | **BẮT BUỘC** |
| `@MaKhachHang` | VARCHAR(50) | '' | Mã khách hàng. Để trống = xem hàng bán chạy toàn chi nhánh |
| `@TopN` | INT | 10 | Số sản phẩm gợi ý tối đa |

### Kịch bản 1.1 — Hôm nay nên bán gì cho khách X?
```
Người dùng hỏi:
- "Hôm nay nên bán gì cho khách HYA107?"
- "Gợi ý đơn hàng cho NT Thu Thuỷ"
- "Khách [TÊN/MÃ] nên mua gì?"

→ AI gọi:
EXEC API_GoiYDonHang_AI
    @Username    = '{username}',
    @MaKhachHang = '{maKhachHang}',
    @TopN        = 10
```

### Kịch bản 1.2 — Hàng bán chạy nhất hôm nay (không có khách cụ thể)
```
Người dùng hỏi:
- "Hôm nay nên tập trung bán gì?"
- "Sản phẩm bán chạy nhất chi nhánh?"
- "Top hàng nên đẩy hôm nay"

→ AI gọi:
EXEC API_GoiYDonHang_AI
    @Username    = '{username}',
    @MaKhachHang = '',
    @TopN        = 10
```

### Kết quả trả về
- `ItemID`, `TenSanPham`, `DoanhSoDaMua`, `LanMuaCuoi`
- `ChuKyTrungBinh` — Chu kỳ mua trung bình (ngày)
- `SoNgayDuKienConLai` — Dự kiến bao nhiêu ngày nữa khách hết hàng
- `LyDoGoiY` — Lý do AI đề xuất (☢️ Quá hạn / ⏳ Sắp hết / 📦 Ổn định / 📅 Mùa vụ / 🎁 KM)

---

## MODULE 2 — AI QUẢN LÝ TUYẾN BÁN HÀNG
**Stored Procedure:** `API_TuyenBanHang_AI`

### Tham số
| Tham số | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `@Username` | VARCHAR(50) | '' | **BẮT BUỘC** |
| `@MaKhachHang` | VARCHAR(50) | '' | Để trống = xem tuyến tổng. Có = xem 1 khách cụ thể |
| `@SoNgayVangMat` | INT | 45 | Ngưỡng "khách mất tích" (mặc định 45 ngày) |
| `@NgayBaoDong` | INT | 7 | Cảnh báo trước bao nhiêu ngày |
| `@TopN` | INT | 8 | Top khách nên ghé hôm nay |

### Kịch bản 2.1 — Hôm nay nên ghé khách nào?
```
Người dùng hỏi:
- "Hôm nay tôi nên ghé khách nào?"
- "Tuyến hôm nay của tôi"
- "Lịch ghé khách hôm nay"
- "Top 8 khách ưu tiên"

→ AI gọi:
EXEC API_TuyenBanHang_AI
    @Username      = '{username}',
    @MaKhachHang   = '',
    @SoNgayVangMat = 45,
    @NgayBaoDong   = 7,
    @TopN          = 8
```

### Kịch bản 2.2 — Kiểm tra tình trạng 1 khách cụ thể
```
Người dùng hỏi:
- "Khách HYA107 có cần ghé không?"
- "Tình trạng nhà thuốc Thu Thuỷ"
- "Khách [MÃ] còn hàng không?"

→ AI gọi:
EXEC API_TuyenBanHang_AI
    @Username    = '{username}',
    @MaKhachHang = '{maKhachHang}'
```

### Kịch bản 2.3 — Cảnh báo khách lâu chưa mua
```
Người dùng hỏi:
- "Khách nào lâu chưa mua hàng?"
- "Danh sách khách có nguy cơ rời bỏ"
- "Khách nào 45 ngày chưa phát sinh đơn?"

→ AI gọi: (kết quả bảng 2 của SP)
EXEC API_TuyenBanHang_AI
    @Username      = '{username}',
    @MaKhachHang   = '',
    @SoNgayVangMat = 45
```

### Kết quả trả về
- **Bảng 1:** Tuyến ghé (`DiemUuTien`, `NgayConLaiHetHang`, `LyDoGhe`)
- **Bảng 2:** Cảnh báo rời bỏ (`NhomCanhBao` 🔴/🟡, `CanhBao`)

---

## MODULE 3 — AI CHẤM ĐIỂM KHÁCH HÀNG (RFM-C)
**Stored Procedure:** `API_ChamDiemKH_AI`

### Tham số
| Tham số | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `@Username` | VARCHAR(50) | '' | **BẮT BUỘC** |
| `@MaKhachHang` | VARCHAR(50) | '' | Để trống = danh sách. Có = chi tiết 1 khách |
| `@NhomFilter` | VARCHAR(5) | '' | Lọc theo nhóm: 'A', 'B', 'C' hoặc '' = tất cả |
| `@W_Recency` | DECIMAL(18,2) | 30.0 | Trọng số thời gian mua gần đây (30%) |
| `@W_Frequency` | DECIMAL(18,2) | 25.0 | Trọng số tần suất mua (25%) |
| `@W_Monetary` | DECIMAL(18,2) | 35.0 | Trọng số giá trị mua (35%) |
| `@W_Consumption` | DECIMAL(18,2) | 10.0 | Trọng số tiêu thụ sản phẩm (10%) |

### Kịch bản 3.1 — Xem toàn bộ phân loại khách hàng
```
Người dùng hỏi:
- "Phân loại khách hàng của tôi"
- "Danh sách khách VIP, ổn định, nguy cơ"
- "Chấm điểm khách hàng"

→ AI gọi:
EXEC API_ChamDiemKH_AI
    @Username       = '{username}',
    @MaKhachHang    = '',
    @NhomFilter     = '',
    @W_Recency      = 30.0,
    @W_Frequency    = 25.0,
    @W_Monetary     = 35.0,
    @W_Consumption  = 10.0
```

### Kịch bản 3.2 — Chỉ xem khách VIP (nhóm A)
```
Người dùng hỏi:
- "Danh sách khách VIP"
- "Khách nhóm A của tôi là ai?"
- "Top khách doanh số cao nhất"

→ AI gọi:
EXEC API_ChamDiemKH_AI
    @Username   = '{username}',
    @NhomFilter = 'A'
```

### Kịch bản 3.3 — Xem khách nguy cơ rời bỏ (nhóm C)
```
Người dùng hỏi:
- "Khách nào có nguy cơ nghỉ mua?"
- "Danh sách khách nhóm C"
- "Khách 90 ngày chưa mua"

→ AI gọi:
EXEC API_ChamDiemKH_AI
    @Username   = '{username}',
    @NhomFilter = 'C'
```

### Kết quả trả về
- `Nhom` — A / B / C
- `PhanLoai` — ⭐ VIP / 🟢 Ổn định / 🔴 Nguy cơ
- `XuHuong` — 📈 Tăng trưởng / 📉 Sụt giảm / ➡️ Ổn định / 📈 Khách mới
- `PhanTramThayDoi` — % thay đổi so với kỳ trước
- **Bảng 2:** Cảnh báo AI (`CanhBaoAI`)

---

## MODULE 4 — AI THEO DÕI CHƯƠNG TRÌNH TÍCH LŨY
**Stored Procedure:** `API_TichLuy_AI`

### Tham số
| Tham số | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `@Username` | VARCHAR(50) | '' | **BẮT BUỘC** |
| `@MaKhachHang` | VARCHAR(50) | '' | Để trống = danh sách khách sắp đạt thưởng |
| `@ProgramID` | VARCHAR(50) | '' | Để trống = lấy chương trình mới nhất tự động (`CTTT202603`) |
| `@TuNgay` | DATETIME | NULL | Từ ngày |
| `@DenNgay` | DATETIME | NULL | Đến ngày |
| `@ItemIDs` | VARCHAR(500) | '' | Danh sách mã sản phẩm phân cách bằng dấu phẩy |

### Kịch bản 4.1 — Xem tích lũy của 1 khách cụ thể
```
Người dùng hỏi:
- "Khách HYA107 tích lũy được bao nhiêu rồi?"
- "NT Thu Thuỷ còn thiếu bao nhiêu để nhận thưởng?"
- "Tình trạng tích lũy của khách [MÃ]"

→ AI gọi:
EXEC API_TichLuy_AI
    @Username    = '{username}',
    @MaKhachHang = '{maKhachHang}'
```

### Kết quả trả về
- **Bảng 0:** Thông tin chương trình (`TenChuongTrinh`, `FromDate`, `ToDate`)
- **Bảng 1:** Tình trạng tích lũy (`TichLuyDatDuoc`, `SoQuaDaDat`, `ConThieuChoQuaTiep`, `TrangThaiAI`)
- **Bảng 2:** Gợi ý bán thêm sản phẩm trọng tâm còn tồn trong kho (chỉ hiển thị khi có `@MaKhachHang`)

---

## MODULE 5 — AI GOOGLE CHO SALE (UPSELL + TÌM THEO TRIỆU CHỨNG)
**Stored Procedure:** `API_UpsellGoiY_AI`

### Tham số
| Tham số | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `@Username` | VARCHAR(50) | '' | **BẮT BUỘC** |
| `@MaKhachHang` | VARCHAR(50) | '' | Mã khách (để tính doanh số thiếu bao nhiêu) |
| `@timkiem` | NVARCHAR(50) | '' | Từ khóa tìm kiếm theo triệu chứng: 'mất ngủ', 'ho', 'sốt', 'đau đầu'... |
| `@TopN` | INT | 10 | Số SP gợi ý tối đa |

### Kịch bản 5.1 — Tìm sản phẩm theo triệu chứng (AI Google)
```
Người dùng hỏi:
- "Khách ho lâu ngày bán gì?"
- "Thuốc cho người bị mất ngủ?"
- "Sản phẩm trị đau đầu của mình?"

→ Trích xuất từ khóa triệu chứng → AI gọi:
EXEC API_UpsellGoiY_AI
    @Username    = '{username}',
    @MaKhachHang = '',
    @timkiem     = N'{từ khoá}',   -- Ví dụ: N'mất ngủ', N'ho'
    @TopN        = 10
```

### Kịch bản 5.2 — Gợi ý bán thêm để khách đạt mức thưởng/chiết khấu
```
Người dùng hỏi:
- "Khách HYA107 thiếu bao nhiêu để được chiết khấu?"
- "Nên bán thêm gì cho NT Thu Thuỷ để đạt mốc tiếp theo?"

→ AI gọi:
EXEC API_UpsellGoiY_AI
    @Username    = '{username}',
    @MaKhachHang = '{maKhachHang}',
    @timkiem     = '',
    @TopN        = 10
```

### Kết quả trả về
- **Bảng 1:** Doanh số (`DoanhSoDaDat`, `SoTienConThieu`, `LoiNhacAI`)
- **Bảng 2:** Gợi ý SP (`GiaBan`, `TonKho`, `PriorityScore`, `LyDoGoiY`)

---

## MODULE 6 — AI ĐỀ XUẤT CHƯƠNG TRÌNH KHUYẾN MẠI (CHO CEO)
**Stored Procedure:** `API_DeXuatKhuyenMai_AI`

### Tham số
| Tham số | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `@Username` | VARCHAR(50) | '' | **BẮT BUỘC** (CEO/Quản lý) |

### Kịch bản 6.1 — Phân tích tồn kho và đề xuất khuyến mãi
```
Người dùng hỏi:
- "Sản phẩm nào nên chạy combo?"
- "Hàng nào cần xả vì cận date?"
- "Tồn kho nào đang bán chậm?"

→ AI gọi:
EXEC API_DeXuatKhuyenMai_AI
    @Username = '{username}'
```

### Kết quả trả về
- `LoaiDeXuat`:
  - `🔴 XẢ HÀNG SÂU` — Hạn dùng < 6 tháng
  - `🟠 CHẠY COMBO` — Tồn kho cao, bán chậm > 180 ngày
  - `🟢 THEO DÕI` — Ổn định
- `ChiTietAI` — Lý do cụ thể + số ngày dự kiến còn tồn

---

## MODULE 8 — AI GỢI Ý ĐƠN THUỐC & BÁN CHÉO
**Stored Procedure:** `API_GoiYDonThuoc_AI`

### Tham số
| Tham số | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `@Username` | VARCHAR(50) | '' | Tên đăng nhập |
| `@timkiem` | NVARCHAR(500) | '' | Danh sách tên thuốc từ đơn hoặc triệu chứng (phân cách bằng dấu phẩy) |

### Kịch bản 8.1 — Tìm sản phẩm thay thế từ đơn thuốc
```
Người dùng hỏi / chụp ảnh đơn thuốc có:
- "Amoxicillin, Vitamin C"
- "Đơn có Cefu 500, Bromhexin"

→ OCR bóc tách tên thuốc → AI gọi:
EXEC API_GoiYDonThuoc_AI
    @Username = '{username}',
    @timkiem  = N'Amoxicillin, Vitamin C'
```

### Kết quả trả về
- `ItemID` — Mã sản phẩm
- `ItemName` — Tên sản phẩm Medstand thay thế
- `Unit` — Đơn vị tính
- `CanhBaoAI` — Gợi ý bán kèm hoặc cảnh báo tương tác tự động từ hệ thống

---

## MODULE 10 — AI SẢN PHẨM TRỌNG TÂM THÁNG
**Stored Procedure:** `API_SanPhamTrongTam_AI`

### Tham số
| Tham số | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `@Username` | VARCHAR(50) | **BẮT BUỘC** | Tên đăng nhập |
| `@MaKhachHang` | VARCHAR(50) | '' | Mã khách hàng cần theo dõi tích lũy sản phẩm trọng tâm |
| `@TopN` | INT | 500 | Số lượng sản phẩm trọng tâm tối đa hiển thị |

### Kịch bản 10.1 — Xem danh sách sản phẩm trọng tâm tháng này
```
Người dùng hỏi:
- "Sản phẩm trọng tâm tháng này gồm những gì?"
- "Tháng này BGĐ chỉ định bán sản phẩm nào?"

→ AI gọi:
EXEC API_SanPhamTrongTam_AI
    @Username    = '{username}',
    @MaKhachHang = '',
    @TopN        = 10
```

### Kịch bản 10.2 — Xem lộ trình quà tặng sản phẩm trọng tâm của khách hàng
```
Người dùng hỏi:
- "Lộ trình sản phẩm trọng tâm của khách HYA107?"
- "Quầy Thuốc Thu Thuỷ tích luỹ được bao nhiêu hàng trọng tâm rồi?"

→ AI gọi:
EXEC API_SanPhamTrongTam_AI
    @Username    = '{username}',
    @MaKhachHang = 'HYA107',
    @TopN        = 10
```

### Kết quả trả về
- **Bảng 1: Lộ trình quà tặng** (`Chương Trình`, `Từ Ngày`, `Đến Ngày`, `Mã Khách`, `Doanh Số Hiện Tại`, `Mốc Kế Tiếp`, `Còn Thiếu`, `Quà Kế Tiếp`, `Thang Quà Tặng Toàn Bộ`)
- **Bảng 2: Danh sách sản phẩm trọng tâm** (`Mã sp`, `Sản Phẩm`, `ĐVT`, `Tồn Kho`, `Giá Bán`)

---

## MODULE 11 — AI TRA CỨU SẢN PHẨM & KIỂM TRA TỒN KHO
**Stored Procedures:** `API_TraCuuSanPham_AI` & `API_DanhSachTonKho_AI`

### Kịch bản 11.1 — Tra cứu thông tin sản phẩm
```
Người dùng hỏi: "Thông tin sản phẩm Antrinano?"
→ AI gọi:
EXEC API_TraCuuSanPham_AI
    @Username = '{username}',
    @timkiem  = N'Antrinano',
    @TopN     = 5
```

### Kịch bản 11.2 — Kiểm tra số lượng tồn kho của 1 sản phẩm
```
Người dùng hỏi: "Tồn kho của sản phẩm A003?"
→ AI gọi:
EXEC API_DanhSachTonKho_AI
    @Username   = '{username}',
    @ItemID     = 'A003',
    @TenSanPham = '',
    @timkiem    = ''
```

---

## MODULE 12 — AI KHẢO SÁT CHĂM SÓC KHÁCH HÀNG
**Stored Procedures:** `API_BatDauBaiKhaoSat`, `API_ChiTietBaiKhaoSat`, `API_NopBaiKhaoSat`, `API_LichSuBaiKhaoSat`

### Kịch bản 12.1 — Bắt đầu bài khảo sát cho nhân viên
```
→ AI gọi khi người dùng muốn thực hiện khảo sát hoặc trả lời câu hỏi chuyên môn:
EXEC API_BatDauBaiKhaoSat
    @User = '{username}',
    @Title = N'Bài khảo sát sản phẩm mới'
```

---

## BẢNG TRA CỨU NHANH — AI ROUTING (V38 CHUẨN XÁC)

| Câu hỏi người dùng | Module | API cần gọi | Tham số chính |
|---|---|---|---|
| "Hôm nay bán gì cho khách X?" | Module 1 | `API_GoiYDonHang_AI` | `@Username`, `@MaKhachHang` |
| "Hàng bán chạy nhất hôm nay?" | Module 1 | `API_GoiYDonHang_AI` | `@Username`, `@MaKhachHang=''` |
| "Hôm nay ghé khách nào?" | Module 2 | `API_TuyenBanHang_AI` | `@Username`, `@MaKhachHang=''` |
| "Khách nào lâu chưa mua?" | Module 2 | `API_TuyenBanHang_AI` | `@Username`, `@SoNgayVangMat=45` |
| "Khách X có nên ghé không?" | Module 2 | `API_TuyenBanHang_AI` | `@Username`, `@MaKhachHang` |
| "Khách VIP của tôi là ai?" | Module 3 | `API_ChamDiemKH_AI` | `@Username`, `@NhomFilter='A'` |
| "Khách nào sắp nghỉ mua?" | Module 3 | `API_ChamDiemKH_AI` | `@Username`, `@NhomFilter='C'` |
| "Phân loại khách hàng" | Module 3 | `API_ChamDiemKH_AI` | `@Username`, `@MaKhachHang=''` |
| "Khách X tích lũy bao nhiêu?" | Module 4 | `API_TichLuy_AI` | `@Username`, `@MaKhachHang` |
| "Thuốc ho / sốt / đau bán gì?" | Module 5 | `API_UpsellGoiY_AI` | `@Username`, `@timkiem` |
| "Bán thêm gì cho khách X?" | Module 5 | `API_UpsellGoiY_AI` | `@Username`, `@MaKhachHang` |
| "Hàng nào cần xả? Chạy combo?" | Module 6 | `API_DeXuatKhuyenMai_AI` | `@Username` |
| "Đơn thuốc này thay thế gì?" | Module 8 | `API_GoiYDonThuoc_AI` | `@Username`, `@timkiem` |
| "Sản phẩm trọng tâm tháng này?" | Module 10 | `API_SanPhamTrongTam_AI` | `@Username`, `@MaKhachHang=''` |
| "Lộ trình sản phẩm trọng tâm khách X?"| Module 10 | `API_SanPhamTrongTam_AI` | `@Username`, `@MaKhachHang` |
| "Thông tin sản phẩm X?" | Module 11 | `API_TraCuuSanPham_AI` | `@Username`, `@timkiem` |
| "Kiểm tra tồn kho sản phẩm X?" | Module 11 | `API_DanhSachTonKho_AI` | `@Username`, `@ItemID` hoặc `@TenSanPham` |

---

## LƯU Ý QUAN TRỌNG CHO AI

1. **`@Username` luôn BẮT BUỘC** — tất cả stored procedures đều yêu cầu tài khoản người dùng để phân quyền tự động theo BranchID.
2. **Tham số khách hàng là `@MaKhachHang`** — không sử dụng `@ObjectID` trong câu truy vấn SQL vì tất cả thủ tục mới đã chuẩn hóa tham số thành `@MaKhachHang` để tránh nhầm lẫn.
3. **Từ khóa tìm kiếm là `@timkiem`** — không dùng `@SearchKey` hay `@Keyword` cho Module 5 và Module 8.
4. **Hiệu năng & Phân quyền:** Quyền hạn tự động kế thừa từ tài khoản hệ thống (không hiển thị chéo dữ liệu vùng MB/MT/MN).
