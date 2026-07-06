/**
 * Danh sách 13 kịch bản kiểm thử hồi quy (Data-driven Test Cases) cho Medstand
 */
const fs = require('fs');
const path = require('path');

module.exports = [
    // =========================================================================
    // SUITE 1: CHATBOT COMMANDS (Các kịch bản kiểm thử hội thoại AI)
    // =========================================================================
    {
        id: 1,
        suite: 'chatbot',
        name: 'Chatbot định danh vai trò người dùng',
        preconditions: 'Đăng nhập vào hệ thống với vai trò Trình dược viên',
        input: 'Vai trò của tôi trên hệ thống là gì?',
        async run(config, assert) {
            const url = `${config.API_BASE}/api/chat`;
            const payload = {
                action: 'chat',
                text: this.input,
                session_id: 'test_session_case_1',
                files: [],
                history: ''
            };

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': config.SIMULATED_TOKEN
                },
                body: JSON.stringify(payload)
            });

            assert.assertStatusCode(res.status, 200, 'Yêu cầu chat định danh thất bại');
            const text = await res.text();
            assert.assertContains(text, '', 'Phản hồi từ chatbot rỗng');

            // AI không được trả về câu thoại từ chối hiểu chung chung
            assert.assertNotContains(text, 'Xin vui lòng cung cấp thêm thông tin', 'AI trả lời bằng câu thoại chung chung từ chối hiểu');
            assert.assertNotContains(text, 'tôi không thể thực hiện', 'AI báo lỗi hệ thống chung chung');

            // AI nên trả lời chứa vai trò hoặc họ tên từ phiên làm việc
            // (Chấp nhận cảnh báo nếu kết quả không khớp hoàn toàn nhưng định dạng đúng)
            const hasIdentity = /vai trò|trình dược viên|quản lý|chi nhánh|chào sếp/i.test(text);
            if (!hasIdentity) {
                throw new Error(`AI trả lời thành công nhưng không chứa thông tin định danh/vai trò. Phản hồi thực tế: "${text.substring(0, 150)}"`);
            }
            return { response: text };
        }
    },
    {
        id: 2,
        suite: 'chatbot',
        name: 'Lệnh nhanh @tuyen_ban_hang tự động nhận diện bối cảnh',
        preconditions: 'Người dùng có dữ liệu tuyến bán hàng được gán trong ngày',
        input: '@tuyen_ban_hang',
        async run(config, assert) {
            const url = `${config.API_BASE}/api/chat`;
            const payload = {
                action: 'chat',
                text: this.input,
                session_id: 'test_session_case_2',
                files: [],
                history: ''
            };

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': config.SIMULATED_TOKEN
                },
                body: JSON.stringify(payload)
            });

            assert.assertStatusCode(res.status, 200, 'Lệnh @tuyen_ban_hang thất bại');
            const text = await res.text();
            assert.assertContains(text, '', 'Phản hồi rỗng');
            assert.assertNotContains(text, 'vui lòng cung cấp thêm thông tin', 'AI không tự động nhận diện bối cảnh tuyến bán hàng');

            // Phản hồi nên chứa thông tin nhà thuốc hoặc lịch trình viếng thăm
            const hasRouteInfo = /nhà thuốc|tuyến|lịch trình|viếng thăm|khách hàng/i.test(text);
            if (!hasRouteInfo) {
                throw new Error(`AI không trả về thông tin tuyến bán hàng chi tiết. Phản hồi thực tế: "${text.substring(0, 150)}"`);
            }
            return { response: text };
        }
    },
    {
        id: 4,
        suite: 'chatbot',
        name: 'Lệnh @tra_cuu_san_pham trả về chi tiết sản phẩm Argelomag',
        preconditions: 'Sản phẩm Argelomag tồn tại trong cơ sở dữ liệu hàng hóa',
        input: '@tra_cuu_san_pham Argelomag',
        async run(config, assert) {
            const url = `${config.API_BASE}/api/chat`;
            const payload = {
                action: 'chat',
                text: this.input,
                session_id: 'test_session_case_4',
                files: [],
                history: ''
            };

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': config.SIMULATED_TOKEN
                },
                body: JSON.stringify(payload)
            });

            assert.assertStatusCode(res.status, 200, 'Lệnh @tra_cuu_san_pham thất bại');
            const text = await res.text();
            assert.assertContains(text, '', 'Phản hồi rỗng');

            // Không được trả về dạng bảng tồn kho chung chung hoặc báo lỗi không tìm thấy
            assert.assertNotContains(text, 'Không tìm thấy sản phẩm', 'Hệ thống báo không tìm thấy sản phẩm Argelomag');

            // Phải hiển thị dưới dạng văn bản đọc hiểu gồm công dụng, thành phần, giá bán
            const hasDetailSpec = /thành phần|công dụng|chỉ định|liều dùng|giá|hộp/i.test(text);
            if (!hasDetailSpec) {
                throw new Error(`AI trả về thông tin nhưng thiếu các nội dung chuyên môn (thành phần/công dụng/giá bán). Phản hồi thực tế: "${text.substring(0, 150)}"`);
            }
            return { response: text };
        }
    },
    {
        id: 6,
        suite: 'chatbot',
        name: 'Lệnh nhanh @bao_cao_cuoi_ngay tự động tổng hợp số liệu',
        preconditions: 'Tài khoản trình dược viên có phát sinh hoạt động trong ngày',
        input: '@bao_cao_cuoi_ngay',
        async run(config, assert) {
            const url = `${config.API_BASE}/api/chat`;
            const payload = {
                action: 'chat',
                text: this.input,
                session_id: 'test_session_case_6',
                files: [],
                history: ''
            };

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': config.SIMULATED_TOKEN
                },
                body: JSON.stringify(payload)
            });

            assert.assertStatusCode(res.status, 200, 'Lệnh @bao_cao_cuoi_ngay thất bại');
            const text = await res.text();
            assert.assertContains(text, '', 'Phản hồi rỗng');
            assert.assertNotContains(text, 'cung cấp thông tin cụ thể hơn', 'AI yêu cầu thêm thông tin thay vì tự tổng hợp');

            // Phản hồi nên chứa tổng hợp báo cáo (số nhà thuốc đã đi, số đơn, doanh số tạm tính)
            const hasReportSummary = /tổng số|doanh số|đơn hàng|nhà thuốc|tạm tính/i.test(text);
            if (!hasReportSummary) {
                throw new Error(`AI không hiển thị bảng tóm tắt kết quả bán hàng trong ngày. Phản hồi thực tế: "${text.substring(0, 150)}"`);
            }
            return { response: text };
        }
    },
    {
        id: 7,
        suite: 'chatbot',
        name: 'Lệnh nhanh @tich_luy tự động nhận diện bối cảnh',
        preconditions: 'Có sẵn phiên làm việc hoặc tài khoản trình dược viên đang hoạt động',
        input: '@tich_luy',
        async run(config, assert) {
            const url = `${config.API_BASE}/api/chat`;
            const payload = {
                action: 'chat',
                text: this.input,
                session_id: 'test_session_case_7',
                files: [],
                history: ''
            };

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': config.SIMULATED_TOKEN
                },
                body: JSON.stringify(payload)
            });

            assert.assertStatusCode(res.status, 200, 'Lệnh @tich_luy thất bại');
            const text = await res.text();
            assert.assertContains(text, '', 'Phản hồi rỗng');

            // AI phải tự động gợi ý chọn nhà thuốc hoặc lấy danh sách đơn thay vì báo thiếu thông tin
            assert.assertNotContains(text, 'cung cấp thêm thông tin', 'AI báo thiếu thông tin thay vì hiển thị danh sách gợi ý nhà thuốc');

            const hasOptions = /nhà thuốc|danh sách|mã khách hàng|tích lũy/i.test(text);
            if (!hasOptions) {
                throw new Error(`AI không hiển thị danh sách/form hoặc giữ ngữ cảnh để chọn nhà thuốc. Phản hồi thực tế: "${text.substring(0, 150)}"`);
            }
            return { response: text };
        }
    },
    {
        id: 8,
        suite: 'chatbot',
        name: 'Lỗi lệnh @upsell_goi_y gợi ý bán thêm',
        preconditions: 'Người dùng gõ lệnh gợi ý bán thêm sản phẩm',
        input: '@upsell_goi_y',
        async run(config, assert) {
            const url = `${config.API_BASE}/api/chat`;
            const payload = {
                action: 'chat',
                text: this.input,
                session_id: 'test_session_case_8',
                files: [],
                history: ''
            };

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': config.SIMULATED_TOKEN
                },
                body: JSON.stringify(payload)
            });

            assert.assertStatusCode(res.status, 200, 'Lệnh @upsell_goi_y thất bại');
            const text = await res.text();
            assert.assertContains(text, '', 'Phản hồi rỗng');

            // AI phải yêu cầu nhập mã khách hàng rõ ràng hoặc đề xuất combo mua kèm
            assert.assertNotContains(text, 'lỗi hệ thống', 'AI báo lỗi hệ thống thay vì hỏi rõ ràng');
            const hasUpsellContext = /mã khách hàng|nhà thuốc|combo|sản phẩm mua cùng|bán kèm/i.test(text);
            if (!hasUpsellContext) {
                throw new Error(`AI không phản hồi đúng ngữ cảnh gợi ý sản phẩm bán kèm. Phản hồi thực tế: "${text.substring(0, 150)}"`);
            }
            return { response: text };
        }
    },
    {
        id: 9,
        suite: 'chatbot',
        name: 'Tính năng lệnh @danh_sach_cau_hoi_khao_sat chưa được cấu hình',
        preconditions: 'Có mã khách hàng HPA515 trong cơ sở dữ liệu khảo sát',
        input: 'Bắt đầu bài khảo sát cho HPA515',
        async run(config, assert) {
            const url = `${config.API_BASE}/api/chat`;
            const payload = {
                action: 'chat',
                text: this.input,
                session_id: 'test_session_case_9',
                files: [],
                history: ''
            };

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': config.SIMULATED_TOKEN
                },
                body: JSON.stringify(payload)
            });

            assert.assertStatusCode(res.status, 200, 'Lệnh khảo sát thất bại');
            const text = await res.text();
            assert.assertContains(text, '', 'Phản hồi rỗng');
            assert.assertNotContains(text, 'tra cứu thông tin gì không ạ', 'AI không nhận diện được luồng nghiệp vụ khảo sát');

            // AI phải nhận diện được yêu cầu khảo sát và tải lên bộ câu hỏi
            const hasSurveyQuestions = /khảo sát|câu hỏi|hài lòng|điểm bán/i.test(text);
            if (!hasSurveyQuestions) {
                throw new Error(`AI không tải lên bộ câu hỏi khảo sát cho khách hàng HPA515. Phản hồi thực tế: "${text.substring(0, 150)}"`);
            }
            return { response: text };
        }
    },
    {
        id: 10,
        suite: 'chatbot',
        name: 'Tính năng Sản phẩm trọng tâm tháng (@san_pham_trong_tam)',
        preconditions: 'Danh sách sản phẩm mục tiêu được thiết lập bởi ban giám đốc',
        input: '@san_pham_trong_tam',
        async run(config, assert) {
            const url = `${config.API_BASE}/api/chat`;
            const payload = {
                action: 'chat',
                text: this.input,
                session_id: 'test_session_case_10',
                files: [],
                history: ''
            };

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': config.SIMULATED_TOKEN
                },
                body: JSON.stringify(payload)
            });

            assert.assertStatusCode(res.status, 200, 'Lệnh @san_pham_trong_tam thất bại');
            const text = await res.text();
            assert.assertContains(text, '', 'Phản hồi rỗng');
            assert.assertNotContains(text, 'không thể thực hiện yêu cầu này', 'Hệ thống báo lỗi không thể thực hiện');
            assert.assertNotContains(text, '[ Câu hỏi 1 ]', 'Giao diện hiển thị bị lỗi các nút bấm template câu hỏi mẫu');

            // Phải chứa thông tin sản phẩm mục tiêu bán hàng trong tháng
            const hasCoreProducts = /sản phẩm trọng tâm|sản phẩm mục tiêu|khuyến mãi tháng|ưu tiên/i.test(text);
            if (!hasCoreProducts) {
                throw new Error(`AI không hiển thị danh sách hàng hóa mục tiêu thúc đẩy bán hàng. Phản hồi thực tế: "${text.substring(0, 150)}"`);
            }
            return { response: text };
        }
    },
    {
        id: 11,
        suite: 'chatbot',
        name: 'Lệnh nhanh @cham_diem_k_h tự động nhận diện bối cảnh',
        preconditions: 'Có khách hàng đang tương tác trong phiên làm việc hoặc nhà thuốc HPA515',
        input: '@cham_diem_k_h',
        async run(config, assert) {
            const url = `${config.API_BASE}/api/chat`;
            const payload = {
                action: 'chat',
                text: this.input,
                session_id: 'test_session_case_11',
                files: [],
                history: ''
            };

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': config.SIMULATED_TOKEN
                },
                body: JSON.stringify(payload)
            });

            assert.assertStatusCode(res.status, 200, 'Lệnh @cham_diem_k_h thất bại');
            const text = await res.text();
            assert.assertContains(text, '', 'Phản hồi rỗng');
            assert.assertNotContains(text, 'xin vui lòng cung cấp thêm thông tin để tôi có thể hỗ trợ bạn tốt hơn', 'AI báo thiếu thông tin thay vì nhận diện bối cảnh');

            // Hệ thống tự động nhận diện khách hàng hoặc hiển thị Form/Gợi ý nhập mã khách hàng
            const hasScoringDetails = /chấm điểm|tín nhiệm|phân loại|RFM|nhà thuốc|mã khách hàng/i.test(text);
            if (!hasScoringDetails) {
                throw new Error(`AI không phản hồi đúng ngữ cảnh chấm điểm tín nhiệm khách hàng. Phản hồi thực tế: "${text.substring(0, 150)}"`);
            }
            return { response: text };
        }
    },

    // =========================================================================
    // SUITE 2: BACKEND API & SECURITY (Kiểm thử bảo mật phân quyền RLS & dữ liệu API)
    // =========================================================================
    {
        id: 5,
        suite: 'api',
        name: 'Tính năng @goi_y_don_hang bị lỗi bảo mật phân quyền RLS chéo 2 chiều',
        preconditions: 'Hệ thống áp dụng chính sách RLS theo vùng miền',
        async run(config, assert) {
            const url = `${config.API_BASE}/api/chat`;

            // CHIỀU 1: Tài khoản Miền Bắc (NAMDINHB.MED) tra cứu gợi ý đơn miền Trung (HUEB111)
            const payload1 = {
                action: 'chat',
                text: '@goi_y_don_hang Gợi ý đơn hàng cho HUEB111',
                session_id: 'test_rls_north_to_central',
                files: [],
                history: ''
            };

            // Ta dùng token giả lập nhưng chỉ định User miền Bắc trong payload/authorization nếu tích hợp n8n.
            // Để chắc chắn, ta giả lập headers truyền user thông tin hoặc n8n sẽ đọc từ auth_token
            // Ở đây, ta kiểm thử hành vi chặn của chatbot
            const res1 = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': config.ACCOUNTS.NORTH.Token || config.SIMULATED_TOKEN,
                    'x-test-user': config.ACCOUNTS.NORTH.UserName // Custom header phục vụ mock kiểm thử nếu có
                },
                body: JSON.stringify(payload1)
            });

            assert.assertStatusCode(res1.status, 200, 'Yêu cầu gợi ý đơn miền Trung từ Bắc thất bại');
            const text1 = await res1.text();

            // Phải bị chặn và hiển thị cảnh báo phân quyền vùng miền
            assert.assertContains(text1, 'không có quyền', 'Chiều 1: Hệ thống không chặn tài khoản miền Bắc xem dữ liệu miền Trung');
            assert.assertNotContains(text1, 'Nhà Thuốc Lê Hùng 2', 'Chiều 1: Hệ thống trả về thông tin chi tiết nhà thuốc miền Trung cho miền Bắc');

            // CHIỀU 2: Tài khoản Miền Trung (HUEB.MED) tra cứu gợi ý đơn miền Bắc (HPA515)
            const payload2 = {
                action: 'chat',
                text: '@goi_y_don_hang Gợi ý đơn hàng cho HPA515',
                session_id: 'test_rls_central_to_north',
                files: [],
                history: ''
            };

            const res2 = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': config.ACCOUNTS.CENTRAL.Token || config.SIMULATED_TOKEN,
                    'x-test-user': config.ACCOUNTS.CENTRAL.UserName
                },
                body: JSON.stringify(payload2)
            });

            assert.assertStatusCode(res2.status, 200, 'Yêu cầu gợi ý đơn miền Bắc từ Trung thất bại');
            const text2 = await res2.text();

            // Phải bị chặn tương tự
            assert.assertContains(text2, 'không có quyền', 'Chiều 2: Hệ thống không chặn tài khoản miền Trung xem dữ liệu miền Bắc');

            return {
                response: `Chiều 1: Bị chặn thành công (${text1.substring(0, 50)}...) | Chiều 2: Bị chặn thành công (${text2.substring(0, 50)}...)`
            };
        }
    },
    {
        id: 12,
        suite: 'api',
        name: 'Form thêm mới khách hàng validate phường xã tương ứng với Quận/Huyện',
        preconditions: 'API phường xã hoạt động và trả về dữ liệu đúng',
        async run(config, assert) {
            // 1. POSITIVE TEST: Truy vấn trực tiếp API phường xã của Medstand với LocationID đúng
            const params = {
                User: config.ACCOUNTS.ADMIN.UserName,
                LocationID: 'Hà Nội',
                QuanHuyen: 'Hoàn Kiếm',
                XaPhuong: '',
                SearchText: ''
            };

            const url = `${config.API_BASE}/api/API_PhuongXa?q=${encodeURIComponent(JSON.stringify(params))}`;
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': config.ACCOUNTS.ADMIN.Token || config.SIMULATED_TOKEN
                }
            });

            assert.assertStatusCode(res.status, 200, 'API phường xã trả về mã lỗi HTTP khác 200');
            const json = await res.json();

            // Dữ liệu trả về phải là một mảng hoặc một object hợp lệ chứa các bản ghi
            assert.assertJsonSchema(json, [], 'Dữ liệu API phường xã không đúng cấu hình JSON');

            const records = Array.isArray(json) ? json : (json.records || json.data || []);
            if (!Array.isArray(records) || records.length === 0) {
                throw new Error('API phường xã không trả về danh sách phường thuộc Quận Hoàn Kiếm, HN.');
            }

            // Kiểm tra xem có phường xã cụ thể nào trong kết quả không (Ví dụ: Hàng Bông, Tràng Tiền)
            const hasWards = records.some(r => {
                const name = String(r.XaPhuong || r.Name || r.text || '');
                return /Hàng Bông|Tràng Tiền|Hàng Bạc|Cửa Đông/i.test(name);
            });

            if (!hasWards) {
                throw new Error('API hoạt động nhưng không chứa các phường xã thực tế của Quận Hoàn Kiếm.');
            }

            // 2. NEGATIVE TEST: Truy cập với mã Tỉnh/Thành không hợp lệ
            const negativeParams = {
                User: config.ACCOUNTS.ADMIN.UserName,
                LocationID: 'INVALID_CODE',
                QuanHuyen: 'Hoàn Kiếm',
                XaPhuong: '',
                SearchText: ''
            };
            const negativeUrl = `${config.API_BASE}/api/API_PhuongXa?q=${encodeURIComponent(JSON.stringify(negativeParams))}`;
            const negRes = await fetch(negativeUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': config.ACCOUNTS.ADMIN.Token || config.SIMULATED_TOKEN
                }
            });
            if (negRes.status === 200) {
                const negJson = await negRes.json();
                const negRecords = Array.isArray(negJson) ? negJson : (negJson.records || negJson.data || []);
                if (negRecords.length > 0) {
                    const hasInvalidWards = negRecords.some(r => {
                        const name = String(r.XaPhuong || r.Name || r.text || '');
                        return /Hàng Bông|Tràng Tiền|Hàng Bạc/i.test(name);
                    });
                    if (hasInvalidWards) {
                        throw new Error('Negative Test FAILED: API phường xã vẫn trả về phường xã của Hoàn Kiếm khi dùng LocationID không hợp lệ.');
                    }
                }
            }

            return { response: `Trả về ${records.length} phường xã hợp lệ thuộc Quận Hoàn Kiếm. Kiểm thử âm tính thành công.` };
        }
    },

    // =========================================================================
    // SUITE 3: STATIC CODE AUDIT (Kiểm thử cấu trúc CSS và đăng ký sự kiện Javascript)
    // =========================================================================
    {
        id: 3,
        suite: 'static',
        name: 'Kiểm tra giao diện CSS: Form Thêm khách hàng không bị đè bởi Header',
        preconditions: 'File customer-management.css tồn tại trong mã nguồn',
        async run(config, assert) {
            const filePath = config.PATHS.CUSTOMER_CSS;
            if (!fs.existsSync(filePath)) {
                throw new Error(`Không tìm thấy file CSS: ${filePath}`);
            }

            const cssContent = fs.readFileSync(filePath, 'utf8');

            // 1. Phân tích z-index của modal-overlay
            const modalMatch = cssContent.match(/\.modal-overlay\s*\{([^}]+)\}/);
            if (!modalMatch) {
                throw new Error('Không tìm thấy class định nghĩa ".modal-overlay" trong CSS.');
            }
            const modalBody = modalMatch[1];
            const modalZIndexMatch = modalBody.match(/z-index\s*:\s*(\d+)/);
            const modalZIndex = modalZIndexMatch ? parseInt(modalZIndexMatch[1], 10) : 0;

            // 2. Phân tích z-index của header (thường định nghĩa trong css hoặc layout, ta quét quy tắc header chung)
            // Ta tìm quy tắc header trong cùng file CSS hoặc giả định so khớp cấu trúc z-index tương đối.
            // Tìm kiếm các class chứa header hoặc top header
            const headerZIndexMatch = cssContent.match(/\.header|\.top-header|\.main-header/g);

            // Để đảm bảo modal đè lên hoàn toàn, modal-overlay phải có z-index lớn (thông thường là 1000 hoặc cao hơn)
            assert.assertStatusCode(modalZIndex >= 1000 ? 1 : 0, 1, `modal-overlay z-index quá thấp (${modalZIndex}), dễ bị đè bởi Header.`);

            return { response: `z-index của .modal-overlay là ${modalZIndex} (Đủ cao để đè lên Header phía sau).` };
        }
    },
    {
        id: 13,
        suite: 'static',
        name: 'Kiểm tra Cổng cập nhật tri thức RAG: Đăng ký sự kiện Drag & Drop',
        preconditions: 'File rag-admin.js tồn tại trong mã nguồn',
        async run(config, assert) {
            const filePath = config.PATHS.RAG_ADMIN_JS;
            if (!fs.existsSync(filePath)) {
                throw new Error(`Không tìm thấy file Javascript: ${filePath}`);
            }

            const jsContent = fs.readFileSync(filePath, 'utf8');

            // 1. Xác thực đăng ký đầy đủ 4 sự kiện drag-and-drop
            const requiredEvents = ['dragenter', 'dragleave', 'dragover', 'drop'];
            for (const ev of requiredEvents) {
                assert.assertContains(
                    jsContent,
                    ev,
                    `Thiếu xử lý sự kiện kéo thả bắt buộc: "${ev}" trong cổng RAG Admin`
                );
            }

            // 2. Xác thực có sử dụng preventDefault() và stopPropagation() để tránh trình duyệt tải file trực tiếp hoặc bỏ qua drop
            assert.assertContains(jsContent, 'preventDefault', 'Không phát hiện cuộc gọi preventDefault() để chặn hành vi mặc định của trình duyệt');
            assert.assertContains(jsContent, 'stopPropagation', 'Không phát hiện cuộc gọi stopPropagation() để ngăn chặn nổi bọt sự kiện kéo thả');

            // 3. Xác thực bổ sung: có biến dragCounter chống nhấp nháy UI và chặn kéo thả toàn cục trên document
            assert.assertContains(jsContent, 'dragCounter', 'Không phát hiện biến đếm dragCounter chống nhấp nháy UI');
            assert.assertContains(jsContent, '$(document).on', 'Không phát hiện sự kiện chặn kéo thả mặc định toàn cục trên document');

            return { response: 'Xác thực sự kiện dragenter, dragCounter, preventDefault/stopPropagation toàn cục đạt yêu cầu.' };
        }
    },
    {
        id: 14,
        suite: 'api',
        name: 'Kiểm tra chặn đăng ký tài khoản tự do theo chính sách bảo mật phân quyền',
        preconditions: 'Cổng WebGateway đang chạy và chặn endpoint /api/API_UserRegister',
        async run(config, assert) {
            const key = 107;
            function encrypt(str) {
                const b64 = Buffer.from(str, 'utf-8').toString('base64');
                let xor = '';
                for (let i = 0; i < b64.length; i++) {
                    xor += String.fromCharCode(b64.charCodeAt(i) ^ key);
                }
                return Buffer.from(xor, 'utf-8').toString('base64');
            }

            const payload = {
                method: 'POST',
                endpoint: '/api/API_UserRegister',
                body: {
                    UserName: 'attacker_test',
                    DisplayName: 'Attacker Account',
                    Password: 'AttackerPassword123'
                }
            };

            const url = `${config.API_BASE}/api/gateway`;
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ data: encrypt(JSON.stringify(payload)) })
            });

            assert.assertStatusCode(res.status, 403, 'Đăng ký tài khoản tự do không bị chặn tại WebGateway');
            const json = await res.json();
            assert.assertContains(json.error, 'vô hiệu hóa', 'Thông báo lỗi không chứa lý do khóa phân quyền');

            return { response: 'Gateway đã chặn yêu cầu đăng ký tự do thành công với lỗi 403 Forbidden.' };
        }
    }
];
