# 🏥 BÁO CÁO KẾT QUẢ KIỂM THỬ HỒI QUY MEDSTAND AI

**Thời gian chạy:** 16:44:37 7/7/2026 (Giờ Việt Nam)

## 📊 Tóm tắt kết quả kiểm thử (Summary)

| Chỉ số | Giá trị | Tỷ lệ |
|---|---|---|
| **Tổng số kịch bản (Total)** | 9 | 100% |
| **Đạt yêu cầu (PASSED)** | **7** | 77.8% |
| **Thất bại (FAILED)** | **2** | 22.2% |
| **Cảnh báo (WARNING)** | **0** | 0.0% |
| **Bỏ qua (SKIPPED)** | **0** | 0.0% |
| **Tỷ lệ vượt qua (Pass Rate)** | **77.8%** | - |

## 📋 Chi tiết kết quả từng Test Case

| STT | Phân hệ (Suite) | Tên kịch bản (Test Case) | Trạng thái | Thời gian chạy | Kết quả chi tiết / Lý do lỗi |
|---|---|---|---|---|---|
| 1 | `chatbot` | Chatbot định danh vai trò người dùng | 🟢 **PASSED** | 526ms | Phản hồi: _"{"status":"info","message":"Dạ, Sếp là **Đoàn Văn Thế**, đang đăng nhập với vai trò **Trình dược viên** thuộc chi nhánh **Miền bắc** ạ!","data":[],"count":0,"apiCode":"ASK_CLARIFICATION"}"_ |
| 2 | `chatbot` | Lệnh nhanh @tuyen_ban_hang tự động nhận diện bối cảnh | 🟢 **PASSED** | 1462ms | Phản hồi: _"{"status":"success","message":"Tim thay 8 ket qua.","data":[{"ObjectID":"NDB096","TenCuaHang":"Quầy Thuốc Hiền Tiến 1","ObjectName":"Quầy Thuốc Hiền Tiến 1","Phone":"0963658613","Address":"Xóm 2, Xã G"_ |
| 4 | `chatbot` | Lệnh @tra_cuu_san_pham trả về chi tiết sản phẩm Argelomag | 🟢 **PASSED** | 1167ms | Phản hồi: _"{"status":"success","message":"Tim thay 1 ket qua.","data":[{"STT":"1","Mã sp":"A004","Sản Phẩm":"Argelomag (15 ml)","Đơn Giá":"0","Tồn Kho":0,"Thành Phần":null,"Công Dụng":null,"Đối Tượng":null,"Cách"_ |
| 6 | `chatbot` | Lệnh nhanh @bao_cao_cuoi_ngay tự động tổng hợp số liệu | 🟢 **PASSED** | 1019ms | Phản hồi: _"{"status":"success","message":"Tim thay 32 ket qua.","data":[{"STT":"1","Từ Ngày":"07/07/2026","Đến Ngày":"07/07/2026","Mã KH":"HPA515","Tên Khách Hàng":"Quầy Thuốc Thu Thủy","Doanh Số":"62,470,000"},"_ |
| 7 | `chatbot` | Lệnh nhanh @tich_luy tự động nhận diện bối cảnh | 🟢 **PASSED** | 1958ms | Phản hồi: _"{"status":"success","message":"Tim thay 1199 ket qua.","data":[{"ProgramID":"MOCK_CTKM_THANG5","ObjectID":"HPA515","TenCuaHang":"Quầy Thuốc Thu Thủy","TichLuyDatDuoc":"413575000","QuaDaDat":"200 hộp q"_ |
| 8 | `chatbot` | Lỗi lệnh @upsell_goi_y gợi ý bán thêm | 🟢 **PASSED** | 415ms | Phản hồi: _"{"status":"info","message":"Dạ, Sếp muốn xem gợi ý bán thêm cho nhà thuốc nào ạ?","data":[],"count":0,"apiCode":"VALIDATION_ERROR"}"_ |
| 9 | `chatbot` | Tính năng lệnh @danh_sach_cau_hoi_khao_sat chưa được cấu hình | 🟢 **PASSED** | 911ms | Phản hồi: _"{"status":"success","message":"Tim thay 4 ket qua.","data":[{"DocumentID":"D15DBBE9-2BE5-4690-97CF-5D1B0628DA6C","Title":"Khảo sát khách hàng HPA515","SoCauHoi":3,"ThoiGianLamBai":"","HanThi":"14/07/2"_ |
| 10 | `chatbot` | Tính năng Sản phẩm trọng tâm tháng (@san_pham_trong_tam) | 🔴 **FAILED** | 3192ms | Lỗi: `AI không hiển thị danh sách hàng hóa mục tiêu thúc đẩy bán hàng. Phản hồi thực tế: "{"status":"success","message":"Tim thay 108 ket qua.","data":[{"Chương Trình":"CHƯƠNG TRÌNH TRỌNG TÂM THÁNG 5 NĂM 2026","Từ Ngày":"2026-05-01T00:00:00"` |
| 11 | `chatbot` | Lệnh nhanh @cham_diem_k_h tự động nhận diện bối cảnh | 🔴 **FAILED** | 10517ms | Lỗi: `AI báo thiếu thông tin thay vì nhận diện bối cảnh (Forbidden: "xin vui lòng cung cấp thêm thông tin để tôi có thể hỗ trợ bạn tốt hơn" was found in "{"status":"info","message":"Xin vui lòng cung cấp thêm thông tin để tôi có thể hỗ trợ bạn tốt hơn.",...")` |

---
_Báo cáo này được tạo tự động bởi Medstand Mini Test Framework._
