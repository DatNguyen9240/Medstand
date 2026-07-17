# Báo cáo đánh giá hiện trạng và Baseline hệ thống Medstand

**Ngày lập:** 17/07/2026  
**Phạm vi:** Dashboard web, chatbot, frontend source, n8n workflow, SQL/API contract, tài liệu UAT và baseline hiện trạng.  
**Mục đích:** Mô tả chính xác hệ thống hiện có, mức đáp ứng yêu cầu khách hàng, xác định các khoảng trống kỹ thuật và thiết lập baseline chuẩn cho hai Agent triển khai song song.

---

## 1. Kết luận điều hành & Baseline Định hướng

Medstand hiện đã có **nền tảng kỹ thuật để hình thành MVP trợ lý bán hàng theo ngữ cảnh**, gồm dashboard vận hành, chatbot hỏi đáp bằng ngôn ngữ tự nhiên, 24 nghiệp vụ đọc, phân quyền theo tài khoản/phạm vi và các API đề xuất bán hàng.

Tuy nhiên, hệ thống hiện tại **chưa phải đầy đủ nền tảng AI theo đúng toàn bộ tầm nhìn khách hàng**. Mức đáp ứng nghiệp vụ thực tế của từng module phải được chấm lại sau khi khóa Business Rule Baseline v1.

> [!IMPORTANT]
> **Cam kết đánh giá hiện trạng:**
> - Source code có cơ chế capability/validation/audit; tuy nhiên, hiệu lực thực thi ở môi trường Production cần được xác nhận lại trên đúng bản build và SQL Server UAT đang chạy.
> - Việc UAT 13 tài khoản mẫu chỉ là bằng chứng kỹ thuật (Technical Pass) cho contract và permission, chưa tự động chứng minh kết quả công thức nghiệp vụ là hoàn toàn đúng đắn.

---

## 2. Hệ thống hiện tại đang có gì?

### 2.1. Dashboard Trang chủ
Dashboard hiện tại đóng vai trò là màn hình tổng quan vận hành, hiển thị các thành phần chính:
- **Header và ngữ cảnh người dùng:** Lời chào theo thời gian thực, tên người dùng kèm vai trò (Manager/TDV), nút chuyển theme sáng/tối và thông báo.
- **KPI tổng quan:** Đơn hàng, số khách hàng giao dịch, tỷ lệ phủ ngành hàng, doanh số tháng có thanh tiến độ (cần chốt công thức tính gross/net, VAT, trả hàng và múi giờ).
- **Biểu đồ doanh số:** Biểu đồ cột doanh số thuần hỗ trợ chuyển đổi ngày/tuần/tháng/quý và lọc khoảng ngày.
- **Dữ liệu hoạt động:** Danh sách sinh nhật hôm nay, lịch công việc cần ghé theo tuyến, đề xuất chăm sóc khách hàng chủ động.
- **Tiến độ chỉ tiêu:** Donut hiển thị tỷ lệ đạt kế hoạch doanh số và khách hàng giao dịch so với chỉ tiêu (cần xác nhận chỉ tiêu lấy theo user, branch hay manager group).

### 2.2. Các màn hình nghiệp vụ truyền thống
Frontend hỗ trợ đầy đủ các màn hình quản trị tác nghiệp:
- Quản lý khách hàng & Chi tiết tài khoản.
- Tạo/Sửa đơn hàng, Danh sách & Chi tiết đơn hàng.
- Quản lý hóa đơn (yêu cầu `DocumentID`).
- Doanh số, tuyến bán hàng, kế hoạch bán hàng.
- Khảo sát & Lịch sử khảo sát của Trình dược viên.
- Trang quản trị RAG/nội dung.

---

## 3. Năng lực của Chatbot

Chatbot hoạt động như một giao diện hội thoại ngôn ngữ tự nhiên, được phân quyền và điều phối chặt chẽ qua n8n workflow.

### 3.1. Các nhóm câu lệnh nghiệp vụ chatbot hỗ trợ

| Nhóm | Chức năng chatbot | Mã API chính |
|---|---|---|
| Khách hàng | Tra cứu danh mục khách hàng | `@danh_muc`, `@khach_hang_list` |
| Doanh số | Xem doanh số theo kỳ, khách, nhân viên, sản phẩm | `@doanh_so` |
| Đơn hàng | Xem danh sách đơn hàng | `@don_hang` |
| Hóa đơn | Tra cứu hóa đơn và mở chi tiết khi có `DocumentID` | `@hoa_don`, `@hoa_don_chi_tiet` |
| Công nợ | Xem tổng công nợ và công nợ chi tiết | `@cong_no_khach_hang`, `@cong_no_chi_tiet` |
| Tồn kho | Kiểm tra tồn kho theo từ khóa/sản phẩm | `@danh_sach_tonkho` |
| Sản phẩm | Tra cứu mã, tên, giá, đơn vị và thông tin sản phẩm | `@tra_cuu_san_pham` |
| Catalogue/trọng tâm | Xem sản phẩm trọng tâm trong chương trình | `@san_pham_trong_tam` |
| Thông báo | Xem thông báo tài khoản, ưu tiên mới nhất | `@thong_bao` |
| Gợi ý bán hàng | Điểm số khách hàng, gợi ý đơn hàng, gợi ý bán kèm | `@cham_diem_kh`, `@goi_ydon_hang`, `@upsell_goi_y` |
| Tuyến / Tích lũy | Xem tuyến, mốc thưởng tích lũy, đề xuất khuyến mại | `@tuyen_ban_hang`, `@tich_luy`, `@de_xuat_khuyen_mai` |

### 3.2. Phân loại kết quả kiểm thử UAT (UAT Assessment Matrix)
Để đánh giá chính xác, các artifact kiểm thử chatbot được phân rã thành ba mức độ:

| Mức kiểm thử | Ý nghĩa thực tế | Kết quả hiện tại |
|---|---|---|
| **Technical PASS** | Request chạy thông suốt, HTTP Code 200/403/422 và response cấu trúc đúng contract. | **Đạt** trên 13 tài khoản mẫu. |
| **Permission PASS** | Phân vùng dữ liệu đúng scope (TDV không xem được khách hàng của vùng khác). | **Đạt** dựa trên RLS SQL và n8n guard. |
| **Business PASS** | Công thức gợi ý đơn hàng, tính chỉ tiêu và đề xuất khuyến mại đúng nghiệp vụ. | **Partial** (Cần đối chiếu với Baseline v1). |

---

## 4. Cơ chế an toàn và Quy chuẩn Bằng chứng (DoD)

Hệ thống Medstand có điểm vượt trội là không gọi trực tiếp SQL từ chatbot mà đi qua một kiến trúc trung gian bảo mật (Intent Parser -> API Gateway -> Capability Validator -> Request Audit).

### Quy chuẩn nhãn bằng chứng chuẩn (DoD Labeling)
Mỗi tính năng hoặc nghiệp vụ trong tài liệu dự án từ nay bắt buộc phải gắn các nhãn sau để tránh việc ngộ nhận tính năng đã hoàn tất:
- `CONFIRMED_BY_SOURCE`: Mã nguồn có cài đặt cơ chế, chưa chạy thử trên môi trường thật.
- `CONFIRMED_BY_RUNTIME`: Đã chạy thử trên môi trường UAT local/server và ghi nhận log/trace.
- `CONFIRMED_BY_UAT`: Đã chạy thành công qua bộ testcase/kịch bản UAT của 13 tài khoản.
- `CONFIRMED_BY_BUSINESS`: Dữ liệu và thuật toán gợi ý đã khớp 100% với Business Rules được khách hàng ký duyệt.
- `PARTIAL`: Đã có khung kỹ thuật nhưng thiếu dữ liệu thực tế hoặc sai lệch so với Baseline v1.

---

## 5. Đối chiếu với 9 Module yêu cầu của Khách hàng

| Module | Mức đáp ứng hiện tại | Phân tích khoảng cách (Gap Analysis) |
|---|---|---|
| 1. Gợi ý đơn hàng | **Một phần** (`PARTIAL`) | Có `@goi_ydon_hang` theo chu kỳ và rule SQL; chưa có dữ liệu tồn kho thực tế tại nhà thuốc và mô hình dự báo "còn 5 ngày sẽ hết". |
| 2. Quản lý tuyến | **Một phần** (`PARTIAL`) | Hiển thị danh sách khách cần ghé; chưa có tối ưu lộ trình di chuyển tự động trên bản đồ số. |
| 3. Chấm điểm khách hàng | **Một phần** (`PARTIAL`) | Có API chấm điểm; cần chuẩn hóa công thức phân nhóm rủi ro nợ xấu và đóng góp doanh số. |
| 4. Tích lũy | **Có nền tảng** (`CONFIRMED_BY_SOURCE`) | Có API tích lũy và renderer; cần chốt quy tắc xử lý khi trả hàng, hủy đơn hoặc trùng chương trình. |
| 5. AI hỏi đáp cho Sale | **Có ở mức MVP** (`CONFIRMED_BY_RUNTIME`) | Hỏi đáp ngôn ngữ tự nhiên, intent parser và RAG kiến thức sản phẩm; cần hoàn thiện kiểm duyệt nội dung y tế. |
| 6. Khuyến mại cho CEO | **Có đề xuất đọc** (`PARTIAL`) | Gợi ý khuyến mại dựa trên hàng tồn kho; chưa có biên lợi nhuận thực tế và luồng CEO bấm Duyệt/Từ chối. |
| 7. Nhận diện đơn thuốc | **Chưa có bằng chứng** (`NOT_VERIFIED`) | Chưa có pipeline xử lý OCR hình ảnh đơn thuốc khả dụng trên môi trường chạy thử. |
| 8. Catalogue sản phẩm | **Có tra cứu cơ bản** (`CONFIRMED_BY_RUNTIME`) | Tra cứu sản phẩm và RAG kiến thức; chưa có CMS đầy đủ để quản lý phiên bản tài liệu PDF/ảnh. |
| 9. Thông báo chương trình | **Có hiển thị** (`CONFIRMED_BY_SOURCE`) | Có API tra cứu thông báo; chưa có module cho phép admin tải file lên và lên lịch gửi theo vùng/vai trò. |

---

## 6. Trình tự công việc tiếp theo

Mọi thay đổi của 2 Agent tiếp theo phải tuân thủ nghiêm ngặt quy trình:
```text
Khóa chặt Business Rule Baseline v1
  └── Khóa API Catalog và build evidence (UAT)
        └── Lập bảng phân tích gap FE/n8n/SQL theo từng Rule ID
              └── Coordinator phê duyệt thiết kế/giao diện mới
                    └── Tiến hành sửa mã nguồn và chạy Regression Test
```
