/**
 * Script phát sinh tự động 5000+ Test Cases và cập nhật vào MEDSTAND_MASTER_TEST_CASES.xlsx
 */
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const workbookPath = path.join(__dirname, '../MEDSTAND_MASTER_TEST_CASES.xlsx');
if (!fs.existsSync(workbookPath)) {
    console.error('Không tìm thấy tệp Excel nguồn:', workbookPath);
    process.exit(1);
}

// Bộ dữ liệu mẫu cho tạo kịch bản
const SQL_PAYLOADS = [
    "' OR '1'='1",
    "' OR 1=1 --",
    "admin' --",
    "admin' #",
    "' UNION SELECT NULL, NULL, NULL --",
    "'; DROP TABLE CF_ObjectTbl; --",
    "'; EXEC xp_cmdshell 'dir'; --",
    "' AND 1=2 UNION SELECT UserName, Password FROM SY_User --",
    "123' OR '1'='1",
    "'; WAITFOR DELAY '0:0:10'; --"
];

const XSS_PAYLOADS = [
    "<script>alert('XSS')</script>",
    "<img src=x onerror=alert(1)>",
    "<svg/onload=alert(1)>",
    "javascript:alert(1)",
    "'\"><script>alert(1)</script>",
    "<iframe src=\"javascript:alert(1)\"></iframe>",
    "<body onload=alert(1)>",
    "<details open ontoggle=alert(1)>"
];

const SPECIAL_CHARS = ["#", "$", "%", "^", "&", "*", "(", ")", "<", ">", "?", "/", "\\", "|", "[", "]", "{", "}", "~", "`"];

// Helper sinh số ngẫu nhiên trong khoảng
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper sinh phần tử ngẫu nhiên
function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ─── PHÁT SINH DATA CHO CÁC SHEET ────────────────────────────────────────────

const sheetGenerators = {
    // 1. AUTH SUITE
    'AUTH': (count) => {
        const rows = [];
        const features = ['Login', 'Logout', 'Session Timeout', 'Password Validation', 'Brute-force Block'];
        const passwords = ['123', 'short', 'no_special123', 'admin', 'abc@123', 'A'.repeat(500), ''];
        const REAL_USERS = [
            'NAMDINHB.MED', 'BACNINHA.MED', 'HUEB.MED', 'DANANGA.MED', 'CanThoA', 'BinhPhuocA',
            'QLBH013.MED', 'QLBH016.MED', 'QLBH005.MED', 'QLBH010.MED', 'QLMN2', 'QLMD1', 'QLBH024.MED'
        ];
        
        for (let i = 1; i <= count; i++) {
            const feature = randomChoice(features);
            const realUser = REAL_USERS[(i - 1) % REAL_USERS.length];
            let scenario = '';
            let steps = '';
            let testData = '';
            let expected = '';
            let priority = 'Medium';
            let severity = 'Major';

            if (feature === 'Login') {
                const isNegative = i % 2 === 0;
                if (isNegative) {
                    const pass = randomChoice(passwords);
                    scenario = `Đăng nhập thất bại với mật khẩu bất thường cho tài khoản ${realUser}`;
                    steps = `1. Vào trang đăng nhập.\n2. Điền username "${realUser}".\n3. Điền mật khẩu "${pass}".\n4. Bấm đăng nhập.`;
                    testData = `User: ${realUser}, Pass: ${pass}`;
                    expected = 'Hệ thống báo sai mật khẩu hoặc chặn đăng nhập, không cấp token.';
                    priority = 'High';
                    severity = 'Critical';
                } else {
                    scenario = `Đăng nhập thành công với tài khoản thực tế ${realUser}`;
                    steps = `1. Vào trang đăng nhập.\n2. Điền username "${realUser}".\n3. Điền mật khẩu "123456".\n4. Bấm đăng nhập.`;
                    testData = `User: ${realUser}, Pass: 123456`;
                    expected = 'Đăng nhập thành công, chuyển hướng về trang chủ và lưu auth_token vào cookie.';
                    priority = 'High';
                    severity = 'Critical';
                }
            } else if (feature === 'Password Validation') {
                scenario = `Đăng ký mật khẩu mới với ký tự đặc biệt biên thứ ${i} cho tài khoản ${realUser}`;
                const specialChar = randomChoice(SPECIAL_CHARS);
                steps = `1. Mở trang Đổi mật khẩu.\n2. Nhập mật khẩu hiện tại.\n3. Nhập mật khẩu mới chứa ký tự "${specialChar}".\n4. Bấm Cập nhật.`;
                testData = `Mật khẩu mới: NewPass${specialChar}123`;
                expected = 'Hệ thống chấp nhận và mã hóa thành công mật khẩu mới chứa ký tự đặc biệt.';
                priority = 'Medium';
                severity = 'Minor';
            } else {
                scenario = `Kiểm tra tự động ngắt kết nối khi hết hạn Session lần thứ ${i} cho tài khoản ${realUser}`;
                steps = `1. Đăng nhập thành công.\n2. Chờ timeout hoặc chỉnh sửa thời gian cookie.\n3. Thực hiện thao tác tải trang.`;
                testData = `Cookie age: 0`;
                expected = 'Hệ thống tự động chuyển hướng về trang login.html và xóa localStorage.';
                priority = 'Medium';
                severity = 'Major';
            }

            rows.push([
                `AUTH_${String(i).padStart(3, '0')}`,
                'Authentication',
                feature,
                scenario,
                'Mạng internet thông suốt, server đang chạy.',
                steps,
                testData,
                expected,
                priority,
                severity,
                'Not Run',
                'Yes'
            ]);
        }
        return rows;
    },

    // 2. USER SUITE
    'USER': (count) => {
        const rows = [];
        const roles = ['Trình dược viên', 'Quản lý', 'Quản trị hệ thống', 'Giám đốc chi nhánh'];
        const branches = ['MB', 'MT', 'MN'];
        const REAL_USERS = [
            'NAMDINHB.MED', 'BACNINHA.MED', 'HUEB.MED', 'DANANGA.MED', 'CanThoA', 'BinhPhuocA',
            'QLBH013.MED', 'QLBH016.MED', 'QLBH005.MED', 'QLBH010.MED', 'QLMN2', 'QLMD1', 'QLBH024.MED'
        ];
        
        for (let i = 1; i <= count; i++) {
            const role = randomChoice(roles);
            const branch = randomChoice(branches);
            const realUser = REAL_USERS[(i - 1) % REAL_USERS.length];
            const scenario = `Cập nhật hồ sơ tài khoản ${realUser} phân vùng miền ${branch}`;
            const steps = `1. Đăng nhập với tài khoản ${realUser}.\n2. Vào trang thông tin cá nhân.\n3. Đổi tên hiển thị thành "TDV ${i} Miền ${branch}".\n4. Bấm lưu.`;
            const testData = `Role: ${role}, Chi nhánh: ${branch}`;
            const expected = `Cập nhật thông tin thành công, localStorage đồng bộ hiển thị và ghi nhận chính xác chi nhánh ${branch}.`;
            
            rows.push([
                `USER_${String(i).padStart(3, '0')}`,
                'User Profile',
                'Profile Edit',
                scenario,
                'Đã đăng nhập vào hệ thống.',
                steps,
                testData,
                expected,
                'Medium',
                'Major',
                'Not Run',
                'Yes'
            ]);
        }
        return rows;
    },

    // 3. CUSTOMER SUITE
    'CUSTOMER': (count) => {
        const rows = [];
        const provinces = ['HN', 'ND', 'HP', 'DN', 'HCM'];
        const wards = ['Hàng Bạc', 'Tràng Tiền', 'Hàng Bông', 'Cửa Đông'];
        
        for (let i = 1; i <= count; i++) {
            const prov = randomChoice(provinces);
            const isNegative = i % 3 === 0;
            let scenario = '';
            let steps = '';
            let testData = '';
            let expected = '';
            let priority = 'Medium';

            if (isNegative) {
                // Negative validation
                scenario = `Validate địa chỉ thất bại do Phường/Xã không thuộc Quận/Huyện lần thứ ${i}`;
                steps = `1. Mở modal thêm mới khách hàng.\n2. Chọn Tỉnh: ${prov}.\n3. Chọn Quận: Quận Hoàn Kiếm.\n4. Cố tình nhập Phường/Xã "Phường Bến Thành" (Sai vùng).\n5. Bấm Lưu.`;
                testData = `Province: ${prov}, District: Quận Hoàn Kiếm, Ward: Phường Bến Thành`;
                expected = 'Hệ thống hiển thị cảnh báo đỏ "Xã phường không hợp lệ" và chặn không cho lưu.';
                priority = 'High';
            } else {
                const ward = randomChoice(wards);
                scenario = `Thêm mới khách hàng nhà thuốc #${i} thuộc khu vực ${prov}`;
                steps = `1. Vào module khách hàng.\n2. Bấm nút Thêm (+).\n3. Điền Tên: Nhà Thuốc An Tâm ${i}.\n4. Chọn Tỉnh: ${prov}.\n5. Chọn Quận: Quận Hoàn Kiếm. Chọn Phường: ${ward}.\n6. Điền SĐT: 09${randomInt(10000000, 99999999)}.\n7. Bấm Xác nhận.`;
                testData = `Name: Nhà Thuốc An Tâm ${i}, SĐT: 09... , Province ID: ${prov}`;
                expected = 'Lưu thành công, API trả về thông báo và hiển thị nhà thuốc mới trên danh sách.';
                priority = 'Medium';
            }

            rows.push([
                `CUST_${String(i).padStart(3, '0')}`,
                'Customer Management',
                'Customer Add',
                scenario,
                'Đã đăng nhập tài khoản có quyền thêm khách hàng.',
                steps,
                testData,
                expected,
                priority,
                'Major',
                'Not Run',
                'Yes'
            ]);
        }
        return rows;
    },

    // 4. PRODUCT SUITE
    'PRODUCT': (count) => {
        const rows = [];
        const keywords = ['Argelomag', 'Antrinano', 'Panadol', 'Decolgen', 'B12', 'Biệt dược'];
        
        for (let i = 1; i <= count; i++) {
            const kw = randomChoice(keywords);
            const isOut = i % 4 === 0;
            let scenario = '';
            let expected = '';

            if (isOut) {
                scenario = `Tra cứu sản phẩm cận date/hết hàng trong kho: ${kw} lần thứ ${i}`;
                expected = `Hiển thị chi tiết sản phẩm ${kw} kèm nhãn cảnh báo cận date hoặc tồn kho = 0.`;
            } else {
                scenario = `Tra cứu sản phẩm ${kw} thành công lần thứ ${i}`;
                expected = `Hiển thị bảng chi tiết gồm thành phần, công dụng, liều dùng và giá niêm yết của ${kw}.`;
            }

            rows.push([
                `PROD_${String(i).padStart(3, '0')}`,
                'Product Catalog',
                'Product Query',
                scenario,
                'Hệ thống mạng bình thường.',
                `1. Gõ từ khóa "${kw}" vào khung tìm kiếm hoặc lệnh chatbot.\n2. Nhấn tìm kiếm/gửi.`,
                `Từ khóa: ${kw}`,
                expected,
                'Medium',
                'Minor',
                'Not Run',
                'Yes'
            ]);
        }
        return rows;
    },

    // 5. ORDER SUITE
    'ORDER': (count) => {
        const rows = [];
        
        for (let i = 1; i <= count; i++) {
            const discount = randomInt(-10, 150); // Có cả giảm giá âm và > 100% để test biên phá hoại
            const quantity = randomInt(-5, 10000); // Có cả số lượng âm và cực lớn
            const isNegative = discount < 0 || discount > 100 || quantity <= 0 || quantity > 5000;
            let scenario = '';
            let expected = '';
            let priority = 'Medium';

            if (isNegative) {
                scenario = `Tạo đơn hàng biên lỗi với số lượng ${quantity} và chiết khấu ${discount}%`;
                expected = 'Hệ thống chặn lại, hiển thị thông báo lỗi validation tham số nhập vào không hợp lệ.';
                priority = 'High';
            } else {
                scenario = `Tạo đơn hàng thành công cho Nhà Thuốc #${i} chiết khấu ${discount}%`;
                expected = `Đơn hàng được lưu nháp hoặc tạo chính thức thành công, tổng tiền tự động tính trừ chiết khấu ${discount}%.`;
            }

            rows.push([
                `ORD_${String(i).padStart(3, '0')}`,
                'Order Management',
                'Create Order',
                scenario,
                'Nhà thuốc đã check-in tuyến bán hàng.',
                `1. Click tạo đơn hàng mới.\n2. Chọn sản phẩm bất kỳ.\n3. Sửa số lượng thành ${quantity}.\n4. Nhập chiết khấu ${discount}%.\n5. Nhấn Lưu đơn.`,
                `Quantity: ${quantity}, Discount: ${discount}%`,
                expected,
                priority,
                'Major',
                'Not Run',
                'Yes'
            ]);
        }
        return rows;
    },

    // 6. DASHBOARD SUITE
    'DASHBOARD': (count) => {
        const rows = [];
        
        for (let i = 1; i <= count; i++) {
            const days = randomInt(-30, 365);
            const scenario = `Kiểm tra biểu đồ doanh số với bộ lọc ngày lệch ${days} ngày so với hiện tại`;
            
            rows.push([
                `DASH_${String(i).padStart(3, '0')}`,
                'Dashboard Stats',
                'Revenue Chart',
                scenario,
                'Đăng nhập tài khoản Manager.',
                `1. Mở trang Dashboard chính.\n2. Click bộ lọc ngày.\n3. Nhập khoảng thời gian lệch ${days} ngày.\n4. Bấm Áp dụng.`,
                `Offset days: ${days}`,
                'Biểu đồ và các chỉ số doanh thu, đơn hàng, tỷ lệ viếng thăm được cập nhật chính xác (hoặc hiển thị trống nếu ngoài vùng dữ liệu).',
                'Medium',
                'Minor',
                'Not Run',
                'Yes'
            ]);
        }
        return rows;
    },

    // 7. CHATBOT SUITE
    'CHATBOT': (count) => {
        const rows = [];
        const commands = [
            '@tuyen_ban_hang', 
            '@tra_cuu_san_pham Argelomag', 
            '@goi_y_don_hang', 
            '@bao_cao_cuoi_ngay', 
            '@tich_luy', 
            '@upsell_goi_y', 
            '@danh_sach_cau_hoi_khao_sat', 
            '@san_pham_trong_tam', 
            '@cham_diem_k_h'
        ];
        
        for (let i = 1; i <= count; i++) {
            const cmd = randomChoice(commands);
            const scenario = `Gửi lệnh chatbot nhanh "${cmd}" trong phiên hội thoại #${i}`;
            const steps = `1. Mở floating chatbot widget.\n2. Gõ lệnh nhanh: "${cmd}".\n3. Nhấn gửi.`;
            let expected = 'Chatbot AI nhận diện bối cảnh lệnh nhanh và phản hồi nghiệp vụ tương ứng ngay lập tức.';
            
            if (cmd === '@goi_y_don_hang') {
                expected = 'Hệ thống RLS tự động đối chiếu phân quyền chi nhánh của User hiện tại để gợi ý sản phẩm phù hợp vùng miền.';
            } else if (cmd === '@tuyen_ban_hang') {
                expected = 'Hệ thống tự lấy ID người dùng hiện tại từ token và trả về chi tiết các nhà thuốc cần đi trong ngày.';
            }

            rows.push([
                `CHAT_${String(i).padStart(3, '0')}`,
                'Chatbot AI',
                'Command Execution',
                scenario,
                'Shadow DOM chatbot đã được khởi động.',
                steps,
                `Lệnh: ${cmd}`,
                expected,
                'High',
                'Major',
                'Not Run',
                'Yes'
            ]);
        }
        return rows;
    },

    // 8. OCR SUITE
    'OCR': (count) => {
        const rows = [];
        
        for (let i = 1; i <= count; i++) {
            const sizes = [100, 2048, 10240, 51200, 102400]; // KB
            const currentSize = randomChoice(sizes);
            const isNegative = currentSize > 10240; // > 10MB
            let scenario = '';
            let expected = '';

            if (isNegative) {
                scenario = `Tải hóa đơn OCR vượt kích thước giới hạn (${currentSize / 1024}MB)`;
                expected = 'Hệ thống lập tức báo lỗi kích thước vượt giới hạn (Max 10MB) và từ chối xử lý.';
            } else {
                scenario = `Tải hóa đơn ảnh OCR hợp lệ (${currentSize}KB) lần thứ ${i}`;
                expected = 'Hệ thống xử lý bóc tách các trường: Tên hàng hóa, Số lượng, Đơn giá và trả về JSON chuẩn.';
            }

            rows.push([
                `OCR_${String(i).padStart(3, '0')}`,
                'Invoice OCR',
                'Image Upload',
                scenario,
                'Module OCR đang hoạt động.',
                `1. Click tải ảnh hóa đơn.\n2. Chọn tệp ảnh dung lượng ${currentSize}KB.\n3. Nhấn Upload.`,
                `File size: ${currentSize}KB`,
                expected,
                'Medium',
                'Major',
                'Not Run',
                'Yes'
            ]);
        }
        return rows;
    },

    // 9. RAG SUITE
    'RAG': (count) => {
        const rows = [];
        
        for (let i = 1; i <= count; i++) {
            const formats = ['pdf', 'docx', 'xlsx', 'txt', 'exe', 'zip'];
            const fmt = randomChoice(formats);
            const isNegative = fmt === 'exe' || fmt === 'zip';
            let scenario = '';
            let expected = '';

            if (isNegative) {
                scenario = `Thử tải lên tri thức RAG định dạng không cho phép: .${fmt}`;
                expected = 'Hệ thống từ chối tải tệp, hiển thị cảnh báo định dạng tệp không được hỗ trợ.';
            } else {
                scenario = `Kéo thả tài liệu RAG .${fmt} hợp lệ vào vùng Dropzone`;
                expected = 'UI hiển thị vòng xoay tiến trình tải lên, nạp tệp vào vector database Qdrant thành công.';
            }

            rows.push([
                `RAG_${String(i).padStart(3, '0')}`,
                'Knowledge Base RAG',
                'Knowledge Feed',
                scenario,
                'Đã truy cập màn hình RAG Admin.',
                `1. Mở Cổng cập nhật RAG.\n2. Kéo thả file test.${fmt} vào vùng quy định.\n3. Theo dõi phản hồi UI.`,
                `Format: .${fmt}`,
                expected,
                'High',
                'Major',
                'Not Run',
                'Yes'
            ]);
        }
        return rows;
    },

    // 10. FILE SUITE
    'FILE': (count) => {
        const rows = [];
        
        for (let i = 1; i <= count; i++) {
            const scenario = `Kiểm tra PWA Service Worker offline lưu trữ đơn hàng #${i}`;
            
            rows.push([
                `FILE_${String(i).padStart(3, '0')}`,
                'PWA Caching',
                'Offline Mode',
                scenario,
                'Trình duyệt mất mạng kết nối mạng hoàn toàn.',
                `1. Ngắt kết nối mạng.\n2. Thêm mới 1 đơn hàng trên giao diện.\n3. Nhấn lưu đơn hàng.`,
                `Network status: Offline`,
                'Hệ thống lưu đơn hàng vào IndexedDB tạm thời và tự động đồng bộ lên server ngay khi phát hiện có mạng trở lại.',
                'High',
                'Critical',
                'Not Run',
                'Yes'
            ]);
        }
        return rows;
    },

    // 11. REPORT SUITE
    'REPORT': (count) => {
        const rows = [];
        
        for (let i = 1; i <= count; i++) {
            const mode = i % 2 === 0 ? 'Append' : 'Overwrite';
            const scenario = `Đồng bộ báo cáo Google Sheets với chế độ ${mode} lần thứ ${i}`;
            
            rows.push([
                `REP_${String(i).padStart(3, '0')}`,
                'Google Sheets Sync',
                'Data Sync',
                scenario,
                'Google Sheets addon được cấp quyền kết nối.',
                `1. Mở sheet quản lý.\n2. Click Addon -> Đồng bộ.\n3. Chọn chế độ ${mode}.\n4. Chạy đồng bộ.`,
                `Chế độ: ${mode}`,
                `Đồng bộ dữ liệu thành công, tự động kẻ viền, autofit chiều rộng cột, tô màu tiêu đề cột tương ứng. Chế độ ${mode} ghi nhận đúng dòng dữ liệu.`,
                'Medium',
                'Major',
                'Not Run',
                'Yes'
            ]);
        }
        return rows;
    },

    // 12. API SUITE
    'API': (count) => {
        const rows = [];
        
        for (let i = 1; i <= count; i++) {
            const cipherText = 'XOR' + i + 'BASE64';
            const scenario = `Cổng API Gateway giải mã gói tin mã hóa lỗi: "${cipherText}"`;
            
            rows.push([
                `API_${String(i).padStart(3, '0')}`,
                'Secure API Gateway',
                'Encrypted Tunnel',
                scenario,
                'API gateway đang lắng nghe cổng 3000.',
                `1. Gửi POST request tới /api/gateway.\n2. Body request cố tình sửa đổi ciphertext thành "${cipherText}".`,
                `Payload: ${cipherText}`,
                'API Gateway trả về mã lỗi 400 Bad Request / Không thể giải mã dữ liệu, chặn đứng request.',
                'High',
                'Critical',
                'Not Run',
                'Yes'
            ]);
        }
        return rows;
    },

    // 13. SECURITY SUITE
    'SECURITY': (count) => {
        const rows = [];
        
        for (let i = 1; i <= count; i++) {
            const isSQL = i % 2 === 0;
            let payload = '';
            let scenario = '';
            let feature = '';

            if (isSQL) {
                payload = randomChoice(SQL_PAYLOADS) + ` -- ${i}`;
                feature = 'SQL Injection Prevention';
                scenario = `Tấn công SQL Injection vào ô tìm kiếm với payload: "${payload.substring(0, 30)}"`;
            } else {
                payload = randomChoice(XSS_PAYLOADS) + ` <!-- ${i} -->`;
                feature = 'XSS Protection';
                scenario = `Tấn công XSS thông qua trường địa chỉ với payload: "${payload.substring(0, 30)}"`;
            }

            rows.push([
                `SEC_${String(i).padStart(3, '0')}`,
                'System Security',
                feature,
                scenario,
                'Hệ thống WAF/Security Gateways đang bật.',
                `1. Mở form tương ứng.\n2. Điền payload độc hại vào input: "${payload}".\n3. Bấm xác nhận gửi.`,
                `Payload: ${payload}`,
                'Hệ thống tự động lọc (sanitize), vô hiệu hóa hoặc chặn đứng request độc hại, không thực thi mã lệnh.',
                'High',
                'Blocker',
                'Not Run',
                'Yes'
            ]);
        }
        return rows;
    },

    // 14. PERFORMANCE SUITE
    'PERFORMANCE': (count) => {
        const rows = [];
        
        for (let i = 1; i <= count; i++) {
            const concurrency = randomInt(50, 1000);
            const scenario = `Kiểm thử hiệu năng chatbot chịu tải song song ${concurrency} Sales Agents`;
            
            rows.push([
                `PERF_${String(i).padStart(3, '0')}`,
                'Performance',
                'Stress Testing',
                scenario,
                'Redis cache đang chạy local, DB pool ổn định.',
                `1. Kích hoạt scripts/simulate_load_test.js với tham số: concurrency = ${concurrency}.\n2. Đánh giá thời gian phản hồi trung bình.`,
                `Concurrency: ${concurrency}`,
                `Hệ thống duy trì thời gian phản hồi chatbot trung bình < 3s, không bị tràn kết nối db pool, tỷ lệ lỗi HTTP 5xx = 0%.`,
                'Medium',
                'Major',
                'Not Run',
                'Yes'
            ]);
        }
        return rows;
    },

    // 15. DATABASE SUITE
    'DATABASE': (count) => {
        const rows = [];
        
        for (let i = 1; i <= count; i++) {
            const scenario = `Kiểm thử ràng buộc duy nhất (Unique Constraint) mã khách hàng KH${1000 + i}`;
            
            rows.push([
                `DB_${String(i).padStart(3, '0')}`,
                'Database Integrity',
                'Constraints',
                scenario,
                'DB MSSQL z5.bms79.com đang kết nối.',
                `1. Mở SQL Server Management Studio.\n2. Thực thi chèn 2 bản ghi cùng mã khách hàng "KH${1000 + i}" vào CF_ObjectTbl.`,
                `ObjectID: KH${1000 + i}`,
                'Database báo lỗi vi phạm khóa chính/ràng buộc duy nhất, rollback toàn bộ transaction chèn dòng thứ 2.',
                'Medium',
                'Major',
                'Not Run',
                'Yes'
            ]);
        }
        return rows;
    }
};

// ─── MAIN EXECUTION ──────────────────────────────────────────────────────────

async function run() {
    console.log('📖 Đang mở tệp Excel:', workbookPath);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(workbookPath);

    console.log('✅ Đã tải file Excel thành công.');
    console.log('Sheets hiện có:', workbook.worksheets.map(s => s.name));

    // Phân bổ chỉ tiêu cho 15 sheets để đạt ~5000 test cases
    const targetCounts = {
        'AUTH': 350,
        'USER': 250,
        'CUSTOMER': 600,
        'PRODUCT': 500,
        'ORDER': 800,
        'DASHBOARD': 250,
        'CHATBOT': 800,
        'OCR': 250,
        'RAG': 400,
        'FILE': 300,
        'REPORT': 300,
        'API': 300,
        'SECURITY': 500,
        'PERFORMANCE': 100,
        'DATABASE': 100
    };

    let totalGenerated = 0;

    for (const [sheetName, targetCount] of Object.entries(targetCounts)) {
        let sheet = workbook.getWorksheet(sheetName);
        
        if (!sheet) {
            console.log(`🆕 Tạo sheet mới: ${sheetName}`);
            sheet = workbook.addWorksheet(sheetName);
        }

        // Định hình các cột
        sheet.columns = [
            { header: 'TC_ID', key: 'tc_id', width: 12 },
            { header: 'Module', key: 'module', width: 20 },
            { header: 'Feature', key: 'feature', width: 25 },
            { header: 'Scenario', key: 'scenario', width: 45 },
            { header: 'Preconditions', key: 'preconditions', width: 35 },
            { header: 'Steps', key: 'steps', width: 45 },
            { header: 'Test Data', key: 'test_data', width: 30 },
            { header: 'Expected Result', key: 'expected_result', width: 45 },
            { header: 'Priority', key: 'priority', width: 10 },
            { header: 'Severity', key: 'severity', width: 10 },
            { header: 'Status', key: 'status', width: 12 },
            { header: 'Automation', key: 'automation', width: 12 }
        ];

        // Xóa các dòng cũ từ dòng 2 trở đi (giữ lại header dòng 1)
        const rowCount = sheet.rowCount;
        if (rowCount > 1) {
            for (let r = rowCount; r > 1; r--) {
                sheet.spliceRows(r, 1);
            }
        }

        // Tạo và nạp các test cases
        const generator = sheetGenerators[sheetName];
        if (generator) {
            const rows = generator(targetCount);
            sheet.addRows(rows);
            totalGenerated += rows.length;
            console.log(`⚡ Sheet [${sheetName}]: Đã chèn ${rows.length} test cases.`);
        }
    }

    // Cập nhật lại Summary Sheet nếu có để thể hiện tổng số lượng mới
    const summarySheet = workbook.getWorksheet('SUMMARY');
    if (summarySheet) {
        console.log('📊 Đang cập nhật số liệu tổng tại sheet SUMMARY...');
        // Đếm và tính toán
        const targetRow = summarySheet.getRow(2); // Dòng chứa "Tổng số lượng Test Cases"
        if (targetRow) {
            targetRow.getCell(2).value = totalGenerated; // Cột số lượng
        }
    }

    console.log(`\n💾 Đang ghi kết quả ra file... (Tổng cộng ${totalGenerated} test cases)`);
    await workbook.xlsx.writeFile(workbookPath);
    console.log('🎉 CẬP NHẬT EXCEL THÀNH CÔNG!');
}

run().catch(err => {
    console.error('❌ Lỗi khi thực hiện sinh test cases:', err);
    process.exit(1);
});
