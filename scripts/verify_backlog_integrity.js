#!/usr/bin/env node
/**
 * Backlog integrity validator.
 *
 * Vì sao tồn tại: đợt audit 07/08/2026 phát hiện 11 dòng backlog có checkbox
 * mâu thuẫn với status — nặng nhất là UAT-018 (P0) hiển thị "[x] PASS" trong khi
 * phần mô tả của chính nó ghi "chưa tạo đơn UAT". Sai lệch loại này không tự lộ
 * ra vì các status tự chế dài dòng không lọc/đếm được bằng công cụ.
 *
 * Quy tắc cốt lõi: checkbox [x] CHỈ được tick khi status thuộc tập TERMINAL.
 * Mọi ngữ cảnh chi tiết thuộc về phần mô tả bên dưới, không thuộc về ô status.
 *
 * Read-only. Không sửa file. Thoát 0 nếu sạch, 1 nếu có vi phạm.
 *
 * Dùng:  node scripts/verify_backlog_integrity.js [đường-dẫn-backlog]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_TARGET = 'docs/BACKLOG_TASK_PHAT_TRIEN_MEDSTAND_AI_2026-07-27.md';

/** Status hợp lệ duy nhất. Bất cứ thứ gì khác đều là vi phạm. */
const VALID_STATUSES = new Set([
    'TODO',
    'IN_PROGRESS',
    'CODE_COMPLETE',
    'READY_FOR_TEST',
    'RUNTIME_PARTIAL',
    'BLOCKED',
    'DONE',
    'DEPRECATED',
    'REOPENED'
]);

/** Chỉ hai status này cho phép tick [x]. */
const TERMINAL_STATUSES = new Set(['DONE', 'DEPRECATED']);

/**
 * Từ khóa tố cáo công việc còn dang dở. Nếu status chứa chúng thì dù đặt tên
 * kiểu gì, task vẫn chưa xong — và chắc chắn không được tick.
 */
const UNFINISHED_MARKERS = ['PENDING', 'BLOCKED', 'OPEN_BLOCKER', 'REQUIRED', 'WIP', 'PARTIAL'];

const TASK_LINE = /^\s*-\s*\[([ xX])\]\s*\*\*([A-Z]+-\d+)\s*[—-]/;

/**
 * Nhóm BIZ-* là sổ quyết định nghiệp vụ chờ khách hàng chốt, không phải task
 * kỹ thuật. Chúng cố ý không mang trường status, nên miễn trừ để cảnh báo thật
 * không bị chìm trong nhiễu.
 */
const EXEMPT_PREFIXES = ['BIZ-'];

/** Lấy status = mã backtick cuối cùng trên dòng, dạng CHỮ_HOA_GẠCH_DƯỚI. */
function extractStatus(line) {
    const codes = line.match(/`([A-Z][A-Z0-9_]*)`/g);
    if (!codes || !codes.length) return null;
    for (let i = codes.length - 1; i >= 0; i -= 1) {
        const value = codes[i].replace(/`/g, '');
        if (/^P[0-3]$/.test(value)) continue;
        return value;
    }
    return null;
}

function auditLine(lineNumber, line) {
    const match = line.match(TASK_LINE);
    if (!match) return null;

    const checked = match[1].toLowerCase() === 'x';
    const taskId = match[2];
    const status = extractStatus(line);
    const violations = [];

    if (EXEMPT_PREFIXES.some(function (p) { return taskId.startsWith(p); })) {
        return { lineNumber: lineNumber, taskId: taskId, checked: checked, status: status, violations: [], exempt: true };
    }

    if (!status) {
        violations.push({
            rule: 'MISSING_STATUS',
            detail: 'Dòng task không có status nào'
        });
    } else {
        if (!VALID_STATUSES.has(status)) {
            violations.push({
                rule: 'INVALID_STATUS',
                detail: '"' + status + '" không thuộc tập status hợp lệ'
            });
        }

        const marker = UNFINISHED_MARKERS.find(function (m) { return status.includes(m); });
        if (checked && marker) {
            violations.push({
                rule: 'CHECKED_BUT_UNFINISHED',
                detail: 'Tick [x] nhưng status chứa "' + marker + '" — task còn dang dở'
            });
        }

        if (checked && VALID_STATUSES.has(status) && !TERMINAL_STATUSES.has(status)) {
            violations.push({
                rule: 'CHECKED_NOT_TERMINAL',
                detail: 'Tick [x] nhưng status là "' + status + '"; chỉ DONE/DEPRECATED mới được tick'
            });
        }

        if (!checked && TERMINAL_STATUSES.has(status)) {
            violations.push({
                rule: 'TERMINAL_NOT_CHECKED',
                detail: 'Status "' + status + '" nhưng chưa tick [x]'
            });
        }
    }

    return { lineNumber: lineNumber, taskId: taskId, checked: checked, status: status, violations: violations };
}

function main() {
    const target = process.argv[2] || DEFAULT_TARGET;
    const absolute = path.resolve(process.cwd(), target);

    if (!fs.existsSync(absolute)) {
        console.error('[FAIL] Không tìm thấy backlog: ' + target);
        process.exit(1);
    }

    const lines = fs.readFileSync(absolute, 'utf8').split(/\r?\n/);
    const tasks = [];
    lines.forEach(function (line, index) {
        const result = auditLine(index + 1, line);
        if (result) tasks.push(result);
    });

    const offenders = tasks.filter(function (t) { return t.violations.length; });
    const checked = tasks.filter(function (t) { return t.checked; });
    const cleanlyDone = tasks.filter(function (t) { return t.checked && !t.violations.length; });

    console.log('='.repeat(72));
    console.log('BACKLOG INTEGRITY CHECK');
    console.log('File     : ' + target);
    console.log('Tong task: ' + tasks.length);
    console.log('='.repeat(72));

    if (offenders.length) {
        console.log('');
        console.log('VI PHAM (' + offenders.length + '):');
        console.log('');
        offenders.forEach(function (t) {
            const box = t.checked ? '[x]' : '[ ]';
            console.log('  dong ' + String(t.lineNumber).padStart(4) + '  ' + box + ' '
                + t.taskId.padEnd(12) + ' ' + (t.status || '(khong co status)'));
            t.violations.forEach(function (v) {
                console.log('         -> ' + v.rule + ': ' + v.detail);
            });
        });
    }

    const pct = function (n) { return Math.round(n / tasks.length * 100); };

    console.log('');
    console.log('-'.repeat(72));
    console.log('Tick [x]               : ' + checked.length + '/' + tasks.length + ' (' + pct(checked.length) + '%)');
    console.log('Trong do that su sach  : ' + cleanlyDone.length + '/' + tasks.length + ' (' + pct(cleanlyDone.length) + '%)');
    if (checked.length !== cleanlyDone.length) {
        console.log('Tien do bi thoi phong  : ' + (checked.length - cleanlyDone.length) + ' task');
    }
    console.log('-'.repeat(72));

    if (offenders.length) {
        console.log('');
        console.log('Quy tac: [x] chi khi status la DONE hoac DEPRECATED.');
        console.log('Ngu canh chi tiet dat o phan mo ta ben duoi, khong dat vao o status.');
        console.log('');
        process.exit(1);
    }

    console.log('');
    console.log('[PASS] Khong co checkbox nao mau thuan voi status.');
    process.exit(0);
}

if (require.main === module) main();

module.exports = { auditLine: auditLine, extractStatus: extractStatus, VALID_STATUSES: VALID_STATUSES, TERMINAL_STATUSES: TERMINAL_STATUSES };
