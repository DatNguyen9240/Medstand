:ON ERROR EXIT

:r ".\Migrate_STOCK001_Stock_Availability_AI.sql"
:r ".\Module_Common_API_DanhMuc_AI.sql"
:r ".\Module_Common_API_DanhsachTonKho_AI.sql"
:r ".\Module_Common_API_HangHoaList_AI.sql"
:r ".\Module_10_API_TraCuuSanPham_AI.sql"
:r ".\Module_10_API_TimSanPhamTheoTrieuChung_AI.sql"
:r ".\Module_08_API_GoiYDonThuoc_AI.sql"
:r ".\Module_05_API_UpsellGoiY_AI.sql"
:r ".\Module_01_API_GoiYDonHang_AI.sql"
:r ".\Module_10_API_SanPhamTrongTam_AI.sql"
:r ".\Module_06_API_DeXuatKhuyenMai_AI.sql"
:r ".\Module_Common_API_DonHangChiTiet_Insert_AI.sql"

PRINT N'STOCK-001 SQL deployment completed.';
GO
