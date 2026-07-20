'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'chatbot-widget', 'js', 'chatbot-renderers-medstand.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'chatbot-widget', 'css', 'chatbot.css'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'sql', 'Module common - API_CongNoChiTiet_AI.sql'), 'utf8');
const summarySql = fs.readFileSync(path.join(root, 'sql', 'Module common - API_CongNoKhachHang_AI.sql'), 'utf8');
const renderers = {};
let nextId = 0;

const helpers = {
    pickField(row, role) {
        const value = this.pickValue(row, role);
        return value === undefined || value === null ? null : { val: value };
    },
    pickValue(row, role) {
        const map = {
            CUSTOMER: ['ObjectID', 'MaKH'],
            ID: ['MaHD', 'DocumentID'],
            TITLE: ['DienGiai', 'Memo', 'TenKH'],
            TREND: ['Ngay', 'DocumentDate'],
            MONEY: ['SoTien', 'TongTienNoThucTe'],
            COUNT: ['TongSoHoaDon']
        };
        const names = map[role] || [];
        for (const name of names) {
            if (Object.prototype.hasOwnProperty.call(row || {}, name)) return row[name];
        }
        return null;
    },
    nextId() {
        nextId += 1;
        return nextId;
    },
    esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },
    fmtCellVal(value) {
        return Number(value || 0).toLocaleString('vi-VN') + ' đ';
    },
    isValidPhone(value) {
        return /^[0-9+]{9,15}$/.test(String(value || '').replace(/\s/g, ''));
    }
};

const context = {
    window: {
        ApiChatbot: {
            helpers,
            registerRenderer(name, renderer) {
                renderers[name] = renderer;
            }
        }
    },
    API_CONFIG: {},
    console,
    Date,
    isFinite,
    setTimeout() {}
};
context.ApiChatbot = context.window.ApiChatbot;
vm.runInNewContext(source, context, { filename: 'chatbot-renderers-medstand.js' });
assert.equal(typeof renderers.CONG_NO, 'function', 'CONG_NO renderer must be registered');

const listHtml = renderers.CONG_NO([{
    ObjectType: 'CUSTOMER',
    CustomerID: 'AG0031',
    CustomerName: 'Nhà thuốc Minh Châu',
    TotalDebt: 6900000,
    PaymentStatus: 'DUE_DATE_UNKNOWN',
    DebtSize: 'SMALL',
    AsOfDate: '2026-07-17',
    DataSource: 'vCongNoBanHang'
}], '', '@cong_no_khach_hang', {});

assert(listHtml.includes('Nhà thuốc Minh Châu'), 'List must show the customer returned by API');
assert(listHtml.includes('6.900.000 đ'), 'List must show TotalDebt without replacing zero/value semantics');
assert(listHtml.includes('Nguồn: vCongNoBanHang'), 'List must show API data source when present');
assert(listHtml.includes('data-debt-as-of="2026-07-17"'), 'Detail action must preserve the summary as-of date');
assert(!listHtml.includes('Nhân viên phụ trách'), 'List must not show fields absent from the API');
assert(!listHtml.includes('Nợ quá hạn'), 'List must not invent overdue totals');
assert(!listHtml.includes('HĐ sắp đến hạn'), 'List must not invent due-soon KPIs');

const detailHtml = renderers.CONG_NO([{
    ObjectType: 'CUSTOMER', CustomerID: 'AG0031', CustomerName: 'Nhà thuốc Minh Châu',
    Phone: '', AsOfDate: '2026-07-17', TotalOutstanding: 6900000,
    InvoiceCount: 1, DebtItemCount: 2, TotalDebitAmount: 6900000, TotalCreditAmount: 0,
    InvoiceNumber: 'HD001', DebtDate: '2026-06-01', DueDate: null,
    DocumentType: 'INVOICE', DebitAmount: 4000000, CreditAmount: 0,
    RemainingAmount: 4000000, OverdueDays: 0, PaymentStatus: 'DUE_DATE_UNKNOWN',
    Description: 'Bán hàng', DataSource: 'SY_GetDebitDocFnc'
}, {
    ObjectType: 'CUSTOMER', CustomerID: 'AG0031', CustomerName: 'Nhà thuốc Minh Châu',
    Phone: '', AsOfDate: '2026-07-17', TotalOutstanding: 6900000,
    InvoiceCount: 1, DebtItemCount: 2, TotalDebitAmount: 6900000, TotalCreditAmount: 0,
    MaChungTu: 'BL001', DebtDate: '2016-01-01', DueDate: null,
    DocumentType: 'OPENING_BALANCE', DebitAmount: 2900000, CreditAmount: 0,
    RemainingAmount: 2900000, OverdueDays: 0, PaymentStatus: 'DUE_DATE_UNKNOWN',
    Description: 'Số dư đầu kỳ', DataSource: 'SY_GetDebitDocFnc'
}], '', '@cong_no_chi_tiet', { khCode: '' });

assert(detailHtml.includes('Nhà thuốc Minh Châu'), 'Detail must show customer identity');
assert(detailHtml.includes('data-debt-detail-customer="AG0031"'), 'Empty engine khCode must fall back to API CustomerID');
assert(detailHtml.includes('Chưa có số điện thoại'), 'Nullable phone must remain explicit');
assert(detailHtml.includes('Hóa đơn'), 'Matched invoice must be labeled as invoice');
assert(detailHtml.includes('Số dư đầu kỳ'), 'Opening balance must not be labeled as invoice');
assert(detailHtml.includes('Số khoản công nợ'), 'Detail must show debt-item count');
assert(detailHtml.includes('Phát sinh tăng'), 'Debit amount must use a neutral business label');
assert(detailHtml.includes('Phát sinh giảm'), 'Credit amount must not be guessed as payment only');
assert(!detailHtml.includes('Gợi ý xử lý'), 'Renderer must not invent a recommendation absent from API');
assert(!detailHtml.includes('Nợ quá hạn'), 'Renderer must not invent an overdue aggregate absent from API');

for (const field of [
    'NgayHoaDon',
    'NgayDenHan',
    'GiaTriBanDau',
    'DaThanhToanTra',
    'TrangThaiCongNo',
    'SoNgayQuaHan',
    'TongGiaTriBanDau',
    'TongDaThanhToanTra',
    'TenKH',
    'SoDienThoai',
    'ObjectType',
    'CustomerID',
    'CustomerName',
    'DocumentType',
    'DebitAmount',
    'CreditAmount',
    'RemainingAmount',
    'PaymentStatus',
    'InvoiceCount',
    'DebtItemCount',
    'TotalOutstanding',
    'DataSource'
]) {
    assert(sql.includes(field), 'SQL response is missing ' + field);
}

assert(!summarySql.includes('Clear hallucinated IDs'), 'Customer names must never be cleared into a list query');
assert(summarySql.includes('ISNULL(isCustomer, 0) = 1'), 'Customer resolver must exclude non-customer objects');
assert(styles.includes('.ai-sales-debt-table'), 'Debt detail table styles are missing');
console.log('Debt renderer and API contract checks passed.');
