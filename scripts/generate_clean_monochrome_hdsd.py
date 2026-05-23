import re
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

# ═══ STYLING UTILITIES FOR WORD ═══

def set_cell_shading(cell, hex_color):
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    cell._tc.get_or_add_tcPr().append(shd)

def set_cell_margins(cell, top=120, bottom=120, left=160, right=160):
    tcMar = parse_xml(f'<w:tcMar {nsdecls("w")}><w:top w:w="{top}" w:type="dxa"/><w:bottom w:w="{bottom}" w:type="dxa"/><w:left w:w="{left}" w:type="dxa"/><w:right w:w="{right}" w:type="dxa"/></w:tcMar>')
    cell._tc.get_or_add_tcPr().append(tcMar)

def set_cell_borders(cell, hex_color="808080", sz="4", val="single"):
    tcBorders = parse_xml(
        f'<w:tcBorders {nsdecls("w")}>'
        f'<w:top w:val="{val}" w:sz="{sz}" w:space="0" w:color="{hex_color}"/>'
        f'<w:left w:val="{val}" w:sz="{sz}" w:space="0" w:color="{hex_color}"/>'
        f'<w:bottom w:val="{val}" w:sz="{sz}" w:space="0" w:color="{hex_color}"/>'
        f'<w:right w:val="{val}" w:sz="{sz}" w:space="0" w:color="{hex_color}"/>'
        f'</w:tcBorders>'
    )
    cell._tc.get_or_add_tcPr().append(tcBorders)

def apply_text_formatting(paragraph, text, font_name="Arial", font_size=Pt(10), color_rgb=None):
    parts = re.split(r'(\*\*.*?\*\*|`.*?`)', text)
    for part in parts:
        if not part:
            continue
        if part.startswith('**') and part.endswith('**'):
            inner = part[2:-2]
            run = paragraph.add_run(inner)
            run.bold = True
            run.font.name = font_name
            run.font.size = font_size
            if color_rgb:
                run.font.color.rgb = color_rgb
        elif part.startswith('`') and part.endswith('`'):
            inner = part[1:-1]
            run = paragraph.add_run(inner)
            run.font.bold = True
            run.font.name = "Courier New"
            run.font.size = font_size - Pt(0.5)
            run.font.color.rgb = RGBColor(0, 0, 0)
        else:
            run = paragraph.add_run(part)
            run.font.name = font_name
            run.font.size = font_size
            if color_rgb:
                run.font.color.rgb = color_rgb

def render_word_table(doc, rows_data, font_family, color_text):
    cleaned_rows = []
    for r in rows_data:
        if re.search(r'^[|\s:-]+$', r):
            continue
        cleaned_rows.append(r)
        
    if not cleaned_rows:
        return
        
    parsed_table = []
    for r in cleaned_rows:
        cells = [c.strip() for c in r.split('|')[1:-1]]
        parsed_table.append(cells)
        
    if not parsed_table:
        return
        
    num_rows = len(parsed_table)
    num_cols = len(parsed_table[0])
    
    w_table = doc.add_table(rows=num_rows, cols=num_cols)
    w_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    w_table.autofit = True
    
    for r_idx, r_data in enumerate(parsed_table):
        row = w_table.rows[r_idx]
        is_header = (r_idx == 0)
        shading_color = "F2F2F2" if is_header else "FFFFFF"
        
        for c_idx, val in enumerate(r_data):
            cell = row.cells[c_idx]
            set_cell_shading(cell, shading_color)
            set_cell_margins(cell, top=120, bottom=120, left=160, right=160)
            
            border_color = "808080" if is_header else "D3D3D3"
            set_cell_borders(cell, hex_color=border_color, sz="4")
            
            p = cell.paragraphs[0]
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(0)
            
            if len(val) <= 4 or val.isdigit() or (is_header and val.upper() in ["STT", "MÃ SP", "ĐẠT", "KHÔNG ĐẠT", "TÀI KHOẢN QL", "TÀI KHOẢN TDV", "MÃ TÀI KHOẢN"]):
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            else:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                
            run = p.add_run()
            run.font.name = font_family
            run.font.size = Pt(9)
            
            if is_header:
                run.bold = True
                run.font.color.rgb = RGBColor(0, 0, 0)
                run.text = val
            else:
                apply_text_formatting(p, val, font_family, Pt(9), color_text)
                
    doc.add_paragraph().paragraph_format.space_after = Pt(6)

# ═══ JS DATA PARSER ═══

def parse_js_data(text):
    users = {}
    blocks = re.findall(r'"([^"]+)":\s*{(.*?)\s*prompts:\s*\[(.*?)\s*\]\s*}', text, re.DOTALL)
    for username, meta_text, prompts_text in blocks:
        meta = {}
        for k, v in re.findall(r'(\w+):\s*"([^"]+)"', meta_text):
            meta[k] = v
            
        prompts = []
        for prompt_match in re.findall(r'\{\s*stt:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*text:\s*"([^"]+)"\s*\}', prompts_text):
            prompts.append({
                'stt': prompt_match[0],
                'name': prompt_match[1],
                'text': prompt_match[2]
            })
        meta['prompts'] = prompts
        users[username] = meta
    return users

# ═══ MAIN Restructure & Compile ═══

def run_restructuring():
    # Read the parsed UAT JS data from scratch file
    js_scratch_path = r"C:\Users\Legion\\.gemini\\antigravity-ide\\brain\\6a02651b-e61b-426a-b4c8-4018525d71d0\\scratch\\parsed_js.txt"
    print("Reading parsed JS scratch data...")
    with open(js_scratch_path, "r", encoding="utf-8") as f:
        js_text = f.read()
        
    uat_users = parse_js_data(js_text)
    print("Successfully parsed UAT users count:", len(uat_users))

    # Define the template content
    md_content = """# HƯỚNG DẪN SỬ DỤNG HỆ THỐNG TRỢ LÝ AI MEDSTAND

*Tài liệu hướng dẫn nghiệp vụ & Kịch bản kiểm thử dành cho Business*
*Phiên bản: V38 (Tháng 05/2026)*

---

## PHẦN 1: THÔNG TIN CHUNG

### 1.1 Giới thiệu mục đích
Tài liệu này hướng dẫn cách sử dụng Trợ lý AI Medstand (tích hợp trên hệ thống medtest.bms79.com). Trợ lý AI Medstand giúp đội ngũ kinh doanh tra cứu dữ liệu doanh số, tồn kho, công nợ, gợi ý bán hàng và lên đơn hàng nhanh chóng bằng ngôn ngữ tự nhiên thông qua cửa sổ chat tương tự như Zalo/Viber.

### 1.2 Đối tượng sử dụng
- **Trình dược viên (Sales)**: Tra cứu doanh số cá nhân, gợi ý đặt hàng, kiểm tra tồn kho, lập đơn hàng mới trực tiếp qua chat.
- **Quản lý vùng (Manager)**: Theo dõi doanh số nhóm, kiểm tra đơn hàng chờ duyệt, quản lý công nợ và hóa đơn trong khu vực phụ trách.
- **Ban Giám đốc (Director)**: Xem báo cáo doanh số tổng quan toàn quốc, kiểm tra sản phẩm trọng tâm và đề xuất khuyến mãi.

---

## PHẦN 2: CHUẨN BỊ BAN ĐẦU

Để bắt đầu sử dụng hệ thống Trợ lý AI, người dùng cần chuẩn bị:
1. **Thiết bị**: Điện thoại thông minh (Android/iPhone) hoặc máy tính có kết nối Internet.
2. **Trình duyệt**: Khuyến nghị sử dụng **Google Chrome** hoặc **Safari** để có trải nghiệm hiển thị mượt mà nhất.
3. **Địa chỉ truy cập**: Vào website `https://medtest.bms79.com`.
4. **Tài khoản đăng nhập**: Sử dụng tên đăng nhập và mật khẩu nội bộ do bộ phận IT cung cấp (Tham khảo danh sách tài khoản kiểm thử UAT ở phần dưới).

*Lưu ý bảo mật*: Hệ thống tự động phân quyền dữ liệu theo phạm vi phụ trách của từng tài khoản đăng nhập. Nhân sự miền nào chỉ xem được dữ liệu miền đó, tuyệt đối bảo mật thông tin.

---

## PHẦN 3: HƯỚNG DẪN SỬ DỤNG CHI TIẾT (CÁC QUY TRÌNH CỐT LÕI)

### Quy trình 1: Tra cứu doanh số & Báo cáo bán hàng
- **Bước 1**: Nhấp vào biểu tượng Chatbot ở góc dưới cùng bên phải màn hình để mở cửa sổ chat.
- **Bước 2**: Nhập câu hỏi tự nhiên bằng tiếng Việt (có dấu hoặc không dấu).
  *Ví dụ:* `doanh so cua toi thang nay` hoặc `doanh thu tuan nay`
- **Bước 3**: Nhấn nút **Gửi** (hoặc Enter). AI sẽ truy xuất dữ liệu tức thời và hiển thị bảng/biểu đồ doanh số ngay trong khung chat.

### Quy trình 2: Lập đơn hàng nhanh qua Chat (Không cần bấm nhiều bước)
- **Bước 1**: Trong ô nhập liệu, gõ tên sản phẩm, số lượng và tên nhà thuốc cần lên đơn.
  *Ví dụ:* `Lên đơn 5 hộp Antrinano cho Quầy Thuốc Thu Thủy`
  *Mẹo*: Không cần nhớ mã sản phẩm, chỉ cần viết tắt tên nhà thuốc, AI sẽ tự động dò tìm thông minh.
- **Bước 2**: AI phân tích câu lệnh, tự động nhận diện sản phẩm, số lượng và thông tin nhà thuốc trong giỏ hàng mẫu, sau đó phản hồi lại để bạn kiểm tra.
- **Bước 3**: Đọc kỹ thông tin hiển thị trên màn hình xác nhận, nhấn nút **Xác nhận** để tạo đơn. Hệ thống sẽ cấp mã đơn hàng mới dạng `DMB0526/...` ở trạng thái "Chờ duyệt".

### Quy trình 3: Xem gợi ý đặt hàng & Bán thêm (Upsell)
- **Bước 1**: Nhập yêu cầu gợi ý đặt hàng cho một khách hàng cụ thể.
  *Ví dụ:* `Gợi ý đơn hàng cho Quầy Thuốc Thu Thủy`
- **Bước 2**: AI phân tích lịch sử mua hàng, tần suất đặt hàng của nhà thuốc đó và đưa ra danh sách sản phẩm gợi ý nên chào kèm lý do cụ thể (ví dụ: "Sản phẩm A sắp hết chu kỳ sử dụng").
- **Bước 3**: Để tăng thêm doanh thu trên mỗi đơn, gõ yêu cầu bán kèm:
  *Ví dụ:* `Có sản phẩm nào bán kèm Antrinano không?`
  AI sẽ gợi ý các sản phẩm bổ trợ (Argelomag, Topalpha...) thường được khách hàng mua cùng nhau.

### Quy trình 4: Quản lý công nợ & Hóa đơn (Dành cho Quản lý)
- **Bước 1**: Gõ yêu cầu xem tổng công nợ khu vực.
  *Ví dụ:* `Tổng công nợ vùng tôi tháng 5`
  AI trả về bảng tổng hợp nợ, danh sách nhà thuốc còn nợ và sắp xếp từ nợ nhiều đến nợ ít.
- **Bước 2**: Tra cứu chi tiết hóa đơn chưa thanh toán của một khách hàng:
  *Ví dụ:* `Nhà Thuốc Lê Hùng 2 còn nợ hóa đơn nào?`
  AI trả về danh sách hóa đơn cụ thể kèm số tiền và ngày đến hạn thanh toán để tiện đôn đốc thu hồi nợ.

### Quy trình 5: Cập nhật tri thức mới lên hệ thống AI (Dành cho Quản lý trở lên)
Nhằm chủ động cập nhật các tài liệu nội bộ (Chính sách bán hàng, Catalogue sản phẩm mới, Chương trình khuyến mãi) mà không cần can thiệp kỹ thuật:
- **Bước 1**: Truy cập menu **"Quản lý Trợ lý (RAG)"** tại Cổng cập nhật tri thức AI (`#/rag-admin`).
- **Bước 2**: Tại vùng kéo thả tài liệu, chọn hoặc kéo thả trực tiếp tài liệu cần nạp (`PDF`, `DOCX`, `XLSX`, hoặc hình ảnh poster `PNG`/`JPG`).
- **Bước 3**: Nhập **Tên tài liệu / Tiêu đề** và lựa chọn **Ngày hết hạn hiệu lực** của tài liệu (nếu có).
- **Bước 4**: Nhấn nút **"Đồng bộ Tri thức lên AI"**.
- **Bước 5**: Khi hộp thoại **Xác nhận** xuất hiện, bấm **Đồng ý**. Hệ thống sẽ tự động bóc tách chữ qua OCR thông minh (đối với ảnh) hoặc băm phân đoạn (đối với văn bản) và lưu trữ bảo mật vào Qdrant Vector Store của công ty.
- **Bước 6**: Sau 5-10 giây, hộp thoại báo cáo **Thành công** sẽ xuất hiện. Trợ lý AI lúc này đã tự động được học tri thức mới và sẵn sàng tư vấn nghiệp vụ cho toàn bộ đội ngũ bán hàng ngay lập tức.

---

## PHẦN 4: CÁC LỖI THƯỜNG GẶP VÀ CÁCH KHẮC PHỤC (FAQ / TROUBLESHOOTING)

- **Vấn đề 1: Tôi quên mật khẩu đăng nhập phải làm thế nào?**
  *Khắc phục*: Hệ thống hiện tại chưa có tính năng tự reset mật khẩu qua email. Bạn vui lòng liên hệ trực tiếp bộ phận IT nội bộ, cung cấp Tên đăng nhập để được cấp lại mật khẩu mới trong vòng 24 giờ.
  
- **Vấn đề 2: AI báo lỗi "Không có quyền xem thông tin này"**
  *Khắc phục*: Đây không phải lỗi hệ thống mà là tính năng bảo mật phân quyền đang hoạt động đúng. Tài khoản của bạn chỉ xem được dữ liệu trong vùng mình phụ trách. Việc cố tình tra cứu số liệu của nhân sự khác vùng sẽ bị AI từ chối.
  
- **Vấn đề 3: Đơn hàng lập nhầm qua chat có hủy được không?**
  *Khắc phục*: Được. Sau khi tạo đơn qua AI, đơn sẽ ở trạng thái "Chờ duyệt". Bạn hãy liên hệ ngay với Quản lý vùng của mình để yêu cầu từ chối duyệt/hủy đơn hàng đó trên hệ thống trước khi kho xuất hàng.

- **Vấn đề 4: AI phản hồi chậm hoặc không gửi được tin nhắn**
  *Khắc phục*: Kiểm tra lại kết nối mạng 3G/4G/Wifi trên điện thoại của bạn. Nếu mạng ổn định, hãy thử F5 (làm mới) lại trang web medtest.bms79.com và đăng nhập lại.

---

## PHẦN 5: THÔNG TIN LIÊN HỆ HỖ TRỢ

Trong quá trình sử dụng hệ thống Medstand AI, nếu gặp bất kỳ khó khăn hoặc sự cố kỹ thuật nào ngoài hướng dẫn trên, xin vui lòng liên hệ:
- **Hotline hỗ trợ kỹ thuật (IT Medstand)**: 1900.xxxx (Nhánh số 3)
- **Email tiếp nhận sự cố**: it-support@medstand.vn
- **Thời gian làm việc**: Từ 8:00 đến 17:30 (Thứ 2 đến Thứ 7 hàng tuần)

---

## PHẦN 6: DANH SÁCH TÀI KHOẢN UAT & DỮ LIỆU KIỂM THỬ THỰC TẾ

### 6.1 Bảng 1: Danh sách tài khoản kiểm thử UAT (Ghép đôi Quản lý & TDV tương ứng)

| STT | Quản lý (Manager) | Tài khoản QL | Trình dược viên (TDV/Sale) | Tài khoản TDV | Vùng phụ trách | Khách hàng mẫu (UAT) |
| :---: | :--- | :---: | :--- | :---: | :---: | :--- |
| 1 | Mai Anh Tuấn | `QLBH013.MED` | Đoàn Văn Thừa | `NAMDINHB.MED` | Miền Bắc | Quầy Thuốc Thu Thủy (`HYA107`) |
| 2 | Trần Văn Hướng | `QLBH016.MED` | Nguyễn Công Đức | `BACNINHA.MED` | Miền Bắc | Quầy Thuốc Thu Thủy (`HYA107`) |
| 3 | Nguyễn Thế Anh | `QLBH005.MED` | Lê Thị Hiền | `HUEB.MED` | Miền Trung | Nhà Thuốc Lê Hùng 2 (`DNA014`) |
| 4 | Nguyễn Văn Việt Anh | `QLBH010.MED` | Lê Thị Lệ | `DANANGA.MED` | Miền Trung | Nhà Thuốc Lê Hùng 2 (`DNA014`) |
| 5 | Trần Văn Luân | `QLMN2` | Nguyễn Thị Thu Thảo | `CanThoA` | Miền Nam | Nhà Thuốc Lê Hùng 2 (`DNA014`) |
| 6 | Nguyễn Văn Thái | `QLMD1` | Nguyễn Quốc Tuấn | `BinhPhuocA` | Miền Nam | Nhà Thuốc Lê Hùng 2 (`DNA014`) |
| 7 | Ngô Đức Hùng | `QLBH024.MED` | Nguyễn Quốc Tuấn | `BinhPhuocA` | Miền Nam | Nhà Thuốc Lê Hùng 2 (`DNA014`) |

### 6.2 Bảng 2: Mapping lệnh nhanh @ menu và Ví dụ câu hỏi tự nhiên

| STT | Tính năng | Lệnh @ nhanh | Ví dụ câu hỏi chat tự nhiên tiếng Việt |
| :---: | :--- | :--- | :--- |
| 01 | Xem doanh số bán hàng | `@doanh_so` | `Doanh so cua toi thang nay` |
| 02 | Bảo mật — phân quyền | `Tự động` | *(Dữ liệu tự giới hạn theo tài khoản đăng nhập)* |
| 03 | Tra cứu đơn hàng | `@don_hang` | `Tra cuu danh sach don hang gan day cua toi` |
| 04 | Tạo đơn hàng mới | `@lap_don_hang` | `Lên đơn 5 hộp Antrinano cho Quầy Thuốc Thu Thủy` |
| 05 | Gợi ý đặt hàng cho khách | `@goi_y_don_hang` | `Gợi ý đơn hàng cho Quầy Thuốc Thu Thủy` |
| 06 | Gợi ý bán kèm (Upsell) | `@upsell_goi_y` | `Có sản phẩm nào bán kèm Antrinano không?` |
| 07 | Tra cứu thông tin sản phẩm | `@tra_cuu_san_pham` | `Thông tin sản phẩm Antrinano Plus` |
| 08 | Xem tổng công nợ khu vực | `@cong_no_khach_hang` | `Tổng công nợ vùng tôi tháng 5` |
| 09 | Chi tiết công nợ từng khách | `@cong_no_chi_tiet` | `Nhà Thuốc Lê Hùng 2 còn nợ hóa đơn nào?` |
| 10 | Tra cứu hóa đơn | `@hoa_don` | `Hóa đơn của Nhà Thuốc Hồng Mai tháng 5` |
| 11 | Điểm tích lũy khách hàng | `@tich_luy` | `Quầy Thuốc Thu Thủy có bao nhiêu điểm tích lũy?` |
| 12 | Tuyến bán hàng | `@tuyen_ban_hang` | `Tuyến bán hàng của tôi hôm nay` |
| 13 | Gợi ý thuốc theo triệu chứng | `@goi_y_don_thuoc` | `Bệnh nhân bị mất ngủ nên dùng thuốc gì?` |
| 14 | Đề xuất khuyến mại | `@de_xuat_khuyen_mai` | `Tháng này có chương trình khuyến mãi gì?` |
| 15 | Sản phẩm trọng tâm tháng | `@san_pham_trong_tam` | `Sản phẩm trọng tâm tháng này là gì?` |
| 16 | Tra cứu danh mục phân loại | `@danh_muc` | `Các nhóm sản phẩm trong hệ thống` |
| 17 | Chấm điểm tin cậy | `@cham_diem_k_h` | `Điểm tín dụng của Quầy Thuốc Thu Thủy` |
| 18 | Kiểm tra tồn kho | `@danh_sach_ton_kho` | `Còn bao nhiêu hộp Antrinano Plus trong kho?` |
| 19 | Khảo sát khách hàng | `@danh_sach_cau_hoi_khao_sat` | `Danh sách câu hỏi khảo sát hôm nay` |

### 6.3 Kịch bản và Câu lệnh Kiểm thử UAT chi tiết theo từng Cặp tài khoản (Manager - Sale)
"""

    EXPECTED_OUTCOMES = {
        "01": {
            "m_exp": "Xem tổng doanh số của cả vùng phụ trách.",
            "s_exp": "Chỉ xem doanh số cá nhân của chính mình."
        },
        "02": {
            "m_exp": "Hệ thống từ chối hiển thị dữ liệu ngoài vùng phụ trách.",
            "s_exp": "Hệ thống từ chối hiển thị dữ liệu ngoài vùng phụ trách."
        },
        "03": {
            "m_exp": "Xem toàn bộ danh sách đơn hàng của cả vùng.",
            "s_exp": "Chỉ xem danh sách đơn hàng của chính mình."
        },
        "04": {
            "m_exp": "Lên đơn cho khách hàng bất kỳ trong vùng.",
            "s_exp": "Lên đơn cho khách hàng thuộc tuyến mình quản lý."
        },
        "05": {
            "m_exp": "Trả về gợi ý đặt hàng cho khách hàng trong vùng.",
            "s_exp": "Trả về gợi ý đặt hàng tương tự cho khách hàng tuyến mình."
        },
        "06": {
            "m_exp": "Đề xuất sản phẩm mua cùng (Argelomag, Topalpha...) để up-sale.",
            "s_exp": "Đề xuất tương tự cho khách hàng tuyến mình phụ trách."
        },
        "07": {
            "m_exp": "Trả về chi tiết quy cách, giá bán, công dụng giống nhau.",
            "s_exp": "Trả về chi tiết quy cách, giá bán, công dụng giống nhau."
        },
        "08": {
            "m_exp": "Xem tổng công nợ toàn vùng và danh sách nợ phân bổ.",
            "s_exp": "Chỉ xem công nợ của các nhà thuốc mình phụ trách."
        },
        "09": {
            "m_exp": "Tra cứu chi tiết từng hóa đơn nợ của khách hàng bất kỳ trong vùng.",
            "s_exp": "Chỉ tra cứu được hóa đơn nợ của khách thuộc tuyến mình."
        },
        "10": {
            "m_exp": "Xem toàn bộ danh sách hóa đơn xuất trong vùng phụ trách.",
            "s_exp": "Chỉ xem danh sách hóa đơn xuất cho khách mình phụ trách."
        },
        "11": {
            "m_exp": "Tra cứu điểm tích lũy của khách hàng bất kỳ trong vùng.",
            "s_exp": "Chỉ tra cứu điểm của khách thuộc tuyến mình quản lý."
        },
        "12": {
            "m_exp": "Xem tổng hợp lịch trình, danh sách tuyến đi của nhân viên cấp dưới.",
            "s_exp": "Chỉ xem lịch trình và tuyến đi của cá nhân mình hôm nay."
        },
        "13": {
            "m_exp": "Trả về phác đồ và sản phẩm bổ trợ chuyên môn giống nhau.",
            "s_exp": "Trả về phác đồ và sản phẩm bổ trợ chuyên môn giống nhau."
        },
        "14": {
            "m_exp": "Trả về chính sách khuyến mại đang áp dụng cho vùng/hệ thống.",
            "s_exp": "Trả về chính sách khuyến mại áp dụng cho khách hàng của mình."
        },
        "15": {
            "m_exp": "Xem danh mục sản phẩm trọng tâm cần thúc đẩy cho vùng.",
            "s_exp": "Xem danh mục sản phẩm trọng tâm để chủ động chào hàng."
        },
        "16": {
            "m_exp": "Tra cứu phân loại nhóm hàng giống nhau.",
            "s_exp": "Tra cứu phân loại nhóm hàng giống nhau."
        },
        "17": {
            "m_exp": "Xem điểm tín nhiệm, phân hạng khách bất kỳ trong vùng.",
            "s_exp": "Chỉ xem phân hạng khách hàng thuộc tuyến mình quản lý."
        },
        "18": {
            "m_exp": "Xem tồn kho ở các kho tổng và kho khu vực phụ trách.",
            "s_exp": "Chỉ xem tồn kho tại các kho được phân quyền bán hàng."
        },
        "19": {
            "m_exp": "Kích hoạt khảo sát cho khách hàng bất kỳ trong vùng.",
            "s_exp": "Kích hoạt khảo sát cho khách hàng thuộc tuyến quản lý."
        }
    }

    pairs_config = [
        {
            "stt": "1",
            "region": "Miền Bắc",
            "region_title": "Cặp 1 (Miền Bắc): Quản lý Mai Anh Tuấn & TDV Đoàn Văn Thừa",
            "m_user": "QLBH013.MED",
            "m_name": "Mai Anh Tuấn",
            "s_user": "NAMDINHB.MED",
            "s_name": "Đoàn Văn Thừa",
            "customer": "Quầy Thuốc Thu Thủy (HYA107)"
        },
        {
            "stt": "2",
            "region": "Miền Bắc",
            "region_title": "Cặp 2 (Miền Bắc): Quản lý Trần Văn Hướng & TDV Nguyễn Công Đức",
            "m_user": "QLBH016.MED",
            "m_name": "Trần Văn Hướng",
            "s_user": "BACNINHA.MED",
            "s_name": "Nguyễn Công Đức",
            "customer": "Quầy Thuốc Thu Thủy (HYA107)"
        },
        {
            "stt": "3",
            "region": "Miền Trung",
            "region_title": "Cặp 3 (Miền Trung): Quản lý Nguyễn Thế Anh & TDV Lê Thị Hiền",
            "m_user": "QLBH005.MED",
            "m_name": "Nguyễn Thế Anh",
            "s_user": "HUEB.MED",
            "s_name": "Lê Thị Hiền",
            "customer": "Nhà Thuốc Lê Hùng 2 (DNA014)"
        },
        {
            "stt": "4",
            "region": "Miền Trung",
            "region_title": "Cặp 4 (Miền Trung): Quản lý Nguyễn Văn Việt Anh & TDV Lê Thị Lệ",
            "m_user": "QLBH010.MED",
            "m_name": "Nguyễn Văn Việt Anh",
            "s_user": "DANANGA.MED",
            "s_name": "Lê Thị Lệ",
            "customer": "Nhà Thuốc Lê Hùng 2 (DNA014)"
        },
        {
            "stt": "5",
            "region": "Miền Nam",
            "region_title": "Cặp 5 (Miền Nam): Quản lý Trần Văn Luân & TDV Nguyễn Thị Thu Thảo",
            "m_user": "QLMN2",
            "m_name": "Trần Văn Luân",
            "s_user": "CanThoA",
            "s_name": "Nguyễn Thị Thu Thảo",
            "customer": "Nhà Thuốc Lê Hùng 2 (DNA014)"
        },
        {
            "stt": "6",
            "region": "Miền Nam",
            "region_title": "Cặp 6 (Miền Nam): Quản lý Nguyễn Văn Thái & TDV Nguyễn Quốc Tuấn",
            "m_user": "QLMD1",
            "m_name": "Nguyễn Văn Thái",
            "s_user": "BinhPhuocA",
            "s_name": "Nguyễn Quốc Tuấn",
            "customer": "Nhà Thuốc Lê Hùng 2 (DNA014)"
        },
        {
            "stt": "7",
            "region": "Miền Nam",
            "region_title": "Cặp 7 (Miền Nam): Quản lý Ngô Đức Hùng & TDV Nguyễn Quốc Tuấn",
            "m_user": "QLBH024.MED",
            "m_name": "Ngô Đức Hùng",
            "s_user": "BinhPhuocA",
            "s_name": "Nguyễn Quốc Tuấn",
            "customer": "Nhà Thuốc Lê Hùng 2 (DNA014)"
        }
    ]

    for p in pairs_config:
        meta = uat_users.get(p["m_user"])
        if not meta:
            continue
            
        md_content += f"\n### 6.3.{p['stt']} {p['region_title']}\n"
        md_content += f"- **Vùng phụ trách (Region)**: {p['region']}\n"
        md_content += f"- **Tài khoản Quản lý (Manager)**: `{p['m_user']}` (Họ tên: {p['m_name']})\n"
        md_content += f"- **Tài khoản Trình dược viên (TDV/Sale)**: `{p['s_user']}` (Họ tên: {p['s_name']})\n"
        md_content += f"- **Khách hàng mẫu (Customer)**: {p['customer']}\n\n"
        
        md_content += "| STT | Tính Năng Kiểm Thử | Câu Hỏi Mẫu (Prompt) | Kỳ Vọng Đăng Nhập Quản Lý | Kỳ Vọng Đăng Nhập TDV/Sale |\n"
        md_content += "| :---: | :--- | :--- | :--- | :--- |\n"
        
        for p_item in meta['prompts']:
            stt_val = p_item['stt']
            name_val = p_item['name']
            text_val = p_item['text']
            
            # Retrieve expectations
            exp = EXPECTED_OUTCOMES.get(stt_val, {"m_exp": "Xem toàn bộ vùng.", "s_exp": "Xem cá nhân."})
            md_content += f"| {stt_val} | {name_val} | `{text_val}` | {exp['m_exp']} | {exp['s_exp']} |\n"
            
        md_content += "\n---\n"

    # Write final restructured Markdown
    md_path = r"c:\Users\Legion\Desktop\AI Nhà Thuốc\Medstand\HDSD_Medstand_AI_Business.md"
    print("Writing fully rebuilt MD manual...")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)
        
    # Compile to DOCX
    docx_path = r"c:\Users\Legion\Desktop\AI Nhà Thuốc\Medstand\HDSD_Medstand_AI_Business.docx"
    docx_alt_path = r"c:\Users\Legion\Desktop\AI Nhà Thuốc\Medstand\HDSD_Medstand_AI_Business_Updated.docx"
    
    print("Compiling to Word DOCX...")
    try:
        compile_to_docx(md_content, docx_path)
    except PermissionError:
        print("\n[Warning] Primary path locked! Saving to alternative path...")
        compile_to_docx(md_content, docx_alt_path)
        print("Fallback DOCX compiled successfully!")

def compile_to_docx(md_content, out_docx_path):
    doc = docx.Document()
    
    # Page setup (margins)
    for section in doc.sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.9)
        section.right_margin = Inches(0.9)
        
    FONT_FAMILY = "Arial"
    COLOR_PRIMARY = RGBColor(0, 0, 0)
    COLOR_SECONDARY = RGBColor(0, 0, 0)
    COLOR_TEXT = RGBColor(0, 0, 0)
    
    lines = md_content.split('\n')
    
    in_table = False
    table_rows = []
    
    idx = 0
    while idx < len(lines):
        line = lines[idx].strip()
        
        # Table parsing
        if line.startswith('|'):
            in_table = True
            table_rows.append(line)
            idx += 1
            continue
        elif in_table:
            in_table = False
            render_word_table(doc, table_rows, FONT_FAMILY, COLOR_TEXT)
            table_rows = []
            
        if not line or line.startswith('---'):
            idx += 1
            continue
            
        # Heading 1
        if line.startswith('# '):
            text = line[2:].strip()
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(20)
            p.paragraph_format.space_after = Pt(6)
            p.paragraph_format.keep_with_next = True
            run = p.add_run(text)
            run.font.name = FONT_FAMILY
            run.font.size = Pt(16)
            run.font.bold = True
            run.font.color.rgb = COLOR_PRIMARY
            
        # Heading 2
        elif line.startswith('## '):
            text = line[3:].strip()
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(15)
            p.paragraph_format.space_after = Pt(5)
            p.paragraph_format.keep_with_next = True
            run = p.add_run(text)
            run.font.name = FONT_FAMILY
            run.font.size = Pt(13.5)
            run.font.bold = True
            run.font.color.rgb = COLOR_SECONDARY
            
        # Heading 3
        elif line.startswith('### '):
            text = line[4:].strip()
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(10)
            p.paragraph_format.space_after = Pt(4)
            p.paragraph_format.keep_with_next = True
            run = p.add_run(text)
            run.font.name = FONT_FAMILY
            run.font.size = Pt(11)
            run.font.bold = True
            run.font.color.rgb = COLOR_TEXT
            
        # Heading 4 (sub-sections)
        elif line.startswith('#### '):
            text = line[5:].strip()
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(8)
            p.paragraph_format.space_after = Pt(3)
            p.paragraph_format.keep_with_next = True
            run = p.add_run(text)
            run.font.name = FONT_FAMILY
            run.font.size = Pt(10)
            run.font.bold = True
            run.font.italic = True
            run.font.color.rgb = COLOR_TEXT
            
        # Bullet list item
        elif line.startswith('- ') or line.startswith('* '):
            text = line[2:].strip()
            p = doc.add_paragraph(style='List Bullet')
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(3.5)
            apply_text_formatting(p, text, FONT_FAMILY, Pt(10), COLOR_TEXT)
            
        # Numbered list item
        elif re.match(r'^\d+\.\s', line):
            match = re.match(r'^(\d+\.)\s(.*)', line)
            num = match.group(1)
            text = match.group(2).strip()
            
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.25)
            p.paragraph_format.first_line_indent = Inches(-0.25)
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(3.5)
            
            run_num = p.add_run(num + " ")
            run_num.font.name = FONT_FAMILY
            run_num.font.size = Pt(10)
            run_num.font.bold = True
            run_num.font.color.rgb = COLOR_PRIMARY
            
            apply_text_formatting(p, text, FONT_FAMILY, Pt(10), COLOR_TEXT)
            
        # Standard paragraph
        else:
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(5)
            apply_text_formatting(p, line, FONT_FAMILY, Pt(10), COLOR_TEXT)
            
        idx += 1
        
    if in_table and table_rows:
        render_word_table(doc, table_rows, FONT_FAMILY, COLOR_TEXT)
        
    print("Saving beautiful DOCX...")
    doc.save(out_docx_path)
    print("DOCX saved successfully!")

if __name__ == "__main__":
    run_restructuring()
