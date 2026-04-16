/**
 * chatbot-mock-injector.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Inject mock API response vào chatbot THẬT (UI production) để test rendering.
 *
 * CÁCH DÙNG:
 *   1. Mở trang chatbot thật (đã login, chatbot đang hiển thị)
 *   2. Mở DevTools → Console (F12)
 *   3. Copy toàn bộ file này → Paste vào Console → Enter
 *   4. Gọi:  MockInjector.run('DEFAULT')      → test card view
 *             MockInjector.run('CONG_NO')      → test công nợ
 *             MockInjector.run('TICH_LUY')     → test tích lũy
 *             MockInjector.run('ERROR')        → test lỗi
 *             MockInjector.run('EMPTY')        → test rỗng
 *             MockInjector.runAll()            → chạy lần lượt tất cả (3s mỗi cái)
 *             MockInjector.list()              → xem danh sách tất cả mock
 *             MockInjector.ui()                → hiện floating panel chọn mock
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function () {
    'use strict';

    // ── Kiểm tra chatbot đã load chưa ────────────────────────────────────────
    if (!window.ApiChatbot || !window.ApiChatbot.__internal) {
        console.error('[MockInjector] ❌ window.ApiChatbot chưa sẵn sàng. Hãy mở trang chatbot trước.');
        return;
    }

    var _handleReply = window.ApiChatbot.__internal.handleReply;

    // ── MOCK DATA ─────────────────────────────────────────────────────────────
    var MOCKS = {

        // ── Card view mặc định ───────────────────────────────────────────────
        DEFAULT: {
            label: 'Card View — DEFAULT (danh sách KH)',
            payload: {
                status: 'success', apiCode: '@cong_no_khach_hang', uiTemplate: 'DEFAULT',
                message: 'Danh sách khách hàng nợ',
                intentParams: { topN: 5 },
                data: [
                    { MaKhachHang: 'KH001', TenKhachHang: 'Nhà thuốc Minh Châu',   SoDienThoai: '0901234567', TongNo: 12500000,  TrangThai: 'Nợ quá hạn', NhomKH: 'A' },
                    { MaKhachHang: 'KH002', TenKhachHang: 'Hiệu thuốc Bình An',    SoDienThoai: '0912345678', TongNo: 8750000,   TrangThai: 'Đang nợ',    NhomKH: 'B' },
                    { MaKhachHang: 'KH003', TenKhachHang: 'Pharmacy Sức Khỏe',     SoDienThoai: '0923456789', TongNo: 3200000,   TrangThai: 'Đang nợ',    NhomKH: 'B' },
                    { MaKhachHang: 'KH004', TenKhachHang: 'Nhà thuốc Thanh Xuân',  SoDienThoai: '0934567890', TongNo: 560000,    TrangThai: 'Đang nợ',    NhomKH: 'C' },
                    { MaKhachHang: 'KH005', TenKhachHang: 'Quầy thuốc Phúc Lợi',  SoDienThoai: '0945678901', TongNo: 0,         TrangThai: 'Đã thanh toán', NhomKH: 'A' }
                ]
            }
        },

        // ── CATALOG — Tồn kho ────────────────────────────────────────────────
        TONKHO: {
            label: 'Catalog — Tồn kho sản phẩm',
            payload: {
                status: 'success', apiCode: '@danh_sach_tonkho', uiTemplate: 'CATALOG',
                message: 'Danh sách tồn kho hiện tại',
                intentParams: {},
                data: [
                    { ItemID: 'SP001', ItemName: 'Paracetamol 500mg',   StoreHouseID: 'KHO1', TonCuoi: 1500, Nhap: 2000, Xuat: 500,  ExpireDate: '2026-12-31' },
                    { ItemID: 'SP002', ItemName: 'Amoxicillin 250mg',   StoreHouseID: 'KHO1', TonCuoi: 230,  Nhap: 500,  Xuat: 270,  ExpireDate: '2026-06-30' },
                    { ItemID: 'SP003', ItemName: 'Vitamin C 1000mg',    StoreHouseID: 'KHO2', TonCuoi: 80,   Nhap: 200,  Xuat: 120,  ExpireDate: '2025-09-15' },
                    { ItemID: 'SP004', ItemName: 'Omeprazole 20mg',     StoreHouseID: 'KHO1', TonCuoi: 0,    Nhap: 150,  Xuat: 150,  ExpireDate: '2025-03-01' }
                ]
            }
        },

        // ── CONG_NO renderer ─────────────────────────────────────────────────
        CONG_NO: {
            label: 'Renderer — CONG_NO (Công nợ chi tiết)',
            payload: {
                status: 'success', apiCode: '@cong_no_chi_tiet', uiTemplate: 'CONG_NO',
                message: 'Công nợ chi tiết khách hàng',
                intentParams: { khachHang: 'KH001' },
                data: [
                    { MaKhachHang: 'KH001', TenKhachHang: 'Nhà thuốc Minh Châu', MaChungTu: 'DH20240101', NgayChungTu: '2024-01-01', TongTienNoThucTe: 5000000,  TrangThai: 'Quá hạn', GhiChu: 'Đơn hàng tháng 1' },
                    { MaKhachHang: 'KH001', TenKhachHang: 'Nhà thuốc Minh Châu', MaChungTu: 'DH20240215', NgayChungTu: '2024-02-15', TongTienNoThucTe: 7500000,  TrangThai: 'Đang nợ',  GhiChu: 'Đơn hàng tháng 2' }
                ]
            }
        },

        // ── TICH_LUY renderer ────────────────────────────────────────────────
        TICH_LUY: {
            label: 'Renderer — TICH_LUY (Tích lũy 75%)',
            payload: {
                status: 'success', apiCode: '@tich_luy', uiTemplate: 'TICH_LUY',
                message: 'Tích lũy điểm',
                intentParams: {},
                data: [
                    { TenKhachHang: 'Nhà thuốc Minh Châu', MucTieu: 20000000, TichLuyDatDuoc: 15000000, TyLe: 75, PhanThuong: 'Quà tặng trị giá 500K', TrangThai: 'Đang tích lũy', NhomKH: 'A' }
                ]
            }
        },

        TICH_LUY_100: {
            label: 'Renderer — TICH_LUY (Hoàn thành 100%)',
            payload: {
                status: 'success', apiCode: '@tich_luy', uiTemplate: 'TICH_LUY',
                message: 'Tích lũy điểm',
                intentParams: {},
                data: [
                    { TenKhachHang: 'Hiệu thuốc Sức Khỏe', MucTieu: 10000000, TichLuyDatDuoc: 10000000, TyLe: 100, PhanThuong: 'iPad mini', TrangThai: 'Hoàn thành', NhomKH: 'B' }
                ]
            }
        },

        // ── Nhiều nhóm / tab ─────────────────────────────────────────────────
        MULTI_GROUP: {
            label: 'Card View — Nhiều nhóm (có Tabs)',
            payload: {
                status: 'success', apiCode: '@cong_no_khach_hang', uiTemplate: 'DEFAULT',
                message: 'Phân loại khách hàng',
                intentParams: {},
                data: [
                    { MaKhachHang: 'KH001', TenKhachHang: 'Minh Châu',    NhomKH: 'A', TongNo: 12500000, TrangThai: 'Nợ quá hạn' },
                    { MaKhachHang: 'KH002', TenKhachHang: 'Bình An',      NhomKH: 'A', TongNo: 8750000,  TrangThai: 'Đang nợ'    },
                    { MaKhachHang: 'KH003', TenKhachHang: 'Sức Khỏe',     NhomKH: 'B', TongNo: 3200000,  TrangThai: 'Đang nợ'    },
                    { MaKhachHang: 'KH004', TenKhachHang: 'Thanh Xuân',   NhomKH: 'B', TongNo: 560000,   TrangThai: 'Đang nợ'    },
                    { MaKhachHang: 'KH005', TenKhachHang: 'Phúc Lợi',     NhomKH: 'C', TongNo: 200000,   TrangThai: 'Đang nợ'    }
                ]
            }
        },

        // ── Plain text (no data) ──────────────────────────────────────────────
        PLAIN_TEXT: {
            label: 'Plain text — AI trả lời tư vấn',
            payload: {
                status: 'success', apiCode: 'api_default', uiTemplate: 'DEFAULT',
                message: 'Dựa trên dữ liệu hiện tại, nhà thuốc Minh Châu có tổng công nợ quá hạn lên đến **12.5 triệu đồng**. Bạn nên ưu tiên liên hệ để thu hồi công nợ trong tuần này.',
                intentParams: {},
                data: []
            }
        },

        // ── Error states ──────────────────────────────────────────────────────
        ERROR: {
            label: 'Error — DB/Logic lỗi',
            payload: {
                status: 'error',
                message: 'DB/Logic Lỗi\nMsg: Missing para or Object not support\nAPI: @test_api'
            }
        },

        CLARIFY: {
            label: 'Error — Cần làm rõ (clarify)',
            payload: {
                status: 'clarify',
                message: 'Bạn muốn xem công nợ của khách hàng nào? Vui lòng cho biết tên hoặc mã khách hàng.',
                reply_field: 'TenKhachHang'
            }
        },

        // ── Empty data ────────────────────────────────────────────────────────
        EMPTY: {
            label: 'Empty — Không có dữ liệu',
            payload: {
                status: 'success', apiCode: '@cong_no_khach_hang', uiTemplate: 'DEFAULT',
                message: 'Không tìm thấy dữ liệu phù hợp.',
                intentParams: {},
                data: []
            }
        },

        // ── Pagination (>30 items) ────────────────────────────────────────────
        PAGINATION: {
            label: 'Pagination — 35 items',
            payload: (function () {
                var rows = [];
                for (var i = 1; i <= 35; i++) {
                    rows.push({
                        MaKhachHang: 'KH' + String(i).padStart(3, '0'),
                        TenKhachHang: 'Nhà thuốc số ' + i,
                        SoDienThoai: '090' + String(1000000 + i),
                        TongNo: Math.floor(Math.random() * 20000000),
                        TrangThai: i % 3 === 0 ? 'Đã thanh toán' : 'Đang nợ',
                        NhomKH: ['A', 'B', 'C'][i % 3]
                    });
                }
                return {
                    status: 'success', apiCode: '@cong_no_khach_hang', uiTemplate: 'DEFAULT',
                    message: 'Danh sách ' + rows.length + ' khách hàng',
                    intentParams: {}, data: rows
                };
            })()
        }
    };

    // ── Core inject ──────────────────────────────────────────────────────────
    function inject(mockKey) {
        var mock = MOCKS[mockKey];
        if (!mock) {
            console.error('[MockInjector] Không tìm thấy mock:', mockKey, '| Dùng MockInjector.list()');
            return;
        }
        console.info('[MockInjector] 🚀 Inject:', mock.label);
        try {
            _handleReply(mock.payload);
            console.info('[MockInjector] ✅ Done.');
        } catch (e) {
            console.error('[MockInjector] ❌ Lỗi khi render:', e);
        }
    }

    // ── Run all sequentially ─────────────────────────────────────────────────
    function runAll(delayMs) {
        var delay = delayMs || 2500;
        var keys = Object.keys(MOCKS);
        var idx = 0;
        console.info('[MockInjector] 🔄 RunAll:', keys.length, 'mock, cách', delay, 'ms');
        function next() {
            if (idx >= keys.length) { console.info('[MockInjector] ✅ RunAll hoàn tất.'); return; }
            inject(keys[idx++]);
            setTimeout(next, delay);
        }
        next();
    }

    // ── Floating UI panel ────────────────────────────────────────────────────
    function buildUI() {
        var existing = document.getElementById('__mock_injector_ui__');
        if (existing) { existing.remove(); return; }

        var panel = document.createElement('div');
        panel.id = '__mock_injector_ui__';
        panel.style.cssText = [
            'position:fixed;bottom:80px;right:16px;z-index:99999',
            'background:#1e293b;border:1px solid #334155;border-radius:12px',
            'padding:12px;width:260px;font-family:system-ui,sans-serif',
            'box-shadow:0 8px 32px rgba(0,0,0,.5);color:#f1f5f9;font-size:12px'
        ].join(';');

        var title = '<div style="font-weight:700;font-size:13px;margin-bottom:8px;color:#3b82f6">🧪 Mock Injector</div>';
        var btns = Object.entries(MOCKS).map(function (entry) {
            var key = entry[0], mock = entry[1];
            return '<button onclick="window.MockInjector.run(\'' + key + '\')" style="' +
                'display:block;width:100%;text-align:left;padding:6px 8px;margin-bottom:4px;' +
                'background:#0f172a;border:1px solid #334155;border-radius:6px;color:#cbd5e1;' +
                'cursor:pointer;font-size:11px;transition:background .15s" ' +
                'onmouseover="this.style.background=\'#1d3461\'" ' +
                'onmouseout="this.style.background=\'#0f172a\'">' +
                '<b style="color:#3b82f6">' + key + '</b><br>' + mock.label +
                '</button>';
        }).join('');

        var footer = '<div style="margin-top:8px;display:flex;gap:6px">' +
            '<button onclick="window.MockInjector.runAll()" style="flex:1;background:#15803d;border:none;border-radius:6px;color:#fff;padding:5px;font-size:11px;cursor:pointer">▶ Run All</button>' +
            '<button onclick="document.getElementById(\'__mock_injector_ui__\').remove()" style="background:#7f1d1d;border:none;border-radius:6px;color:#fff;padding:5px 10px;font-size:11px;cursor:pointer">✕</button>' +
            '</div>';

        panel.innerHTML = title + '<div style="max-height:320px;overflow-y:auto;padding-right:2px">' + btns + '</div>' + footer;
        document.body.appendChild(panel);
        console.info('[MockInjector] 🎛️ Panel hiển thị - click lại MockInjector.ui() để tắt.');
    }

    // ── Public API ───────────────────────────────────────────────────────────
    window.MockInjector = {
        run: inject,
        runAll: runAll,
        ui: buildUI,
        list: function () {
            console.table(Object.entries(MOCKS).map(function (e) {
                return { Key: e[0], Label: e[1].label };
            }));
        },
        mocks: MOCKS
    };

    console.info('%c[MockInjector] ✅ Loaded!', 'color:#22c55e;font-weight:bold');
    console.info('Lệnh: MockInjector.ui() | MockInjector.run("DEFAULT") | MockInjector.runAll() | MockInjector.list()');

    // Tự mở panel luôn
    buildUI();
})();
