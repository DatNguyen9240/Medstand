#!/usr/bin/env node
/**
 * Lọc bản export workflow của n8n trước khi commit.
 *
 * Vì sao cần: n8n gói cả `staticData` vào file export. Đó là bộ nhớ chạy thật của
 * workflow — với MAIN_ChatBot nó chứa context từng phiên chat, kèm luôn header
 * Authorization của người dùng đang đăng nhập. Đã có 6 token thật lọt lên remote
 * theo đường này (reports/runtime-workflows.export.json).
 *
 * `pinData` cũng bị gỡ: đó là dữ liệu mẫu ghim lại khi debug, thường là bản ghi
 * khách hàng thật.
 *
 * Dùng:
 *   node scripts/sanitize_n8n_export.js <file-vao> [-o <file-ra>]
 *   node scripts/sanitize_n8n_export.js <file-vao> --check     # chỉ báo cáo, không ghi
 *
 * Không có -o thì ghi ra "<ten>.safe.json" cạnh file gốc.
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Các chuỗi trông như bí mật, dùng để quét phần còn lại sau khi đã gỡ staticData.
const SECRET_PATTERNS = [
    { name: 'Bearer token', re: /Bearer\s+[A-Za-z0-9._-]{25,}/g },
    { name: 'JWT', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
    { name: 'OpenAI key', re: /sk-[A-Za-z0-9]{20,}/g },
    { name: 'Cookie phiên', re: /(connect\.sid|session|auth[_-]?token)=[A-Za-z0-9._%-]{16,}/gi }
];

const REDACTED = '__REDACTED__';

function parseArgs(argv) {
    const args = { input: null, output: null, check: false };
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === '-o' || a === '--output') args.output = argv[++i];
        else if (a === '--check') args.check = true;
        else if (!args.input) args.input = a;
    }
    return args;
}

/** Gỡ staticData và pinData ở mọi cấp; đếm số chỗ đã gỡ. */
function stripRuntimeState(node, stats) {
    if (node === null || typeof node !== 'object') return node;

    if (Array.isArray(node)) {
        return node.map((item) => stripRuntimeState(item, stats));
    }

    const out = {};
    for (const [key, value] of Object.entries(node)) {
        if (key === 'staticData' && value !== null) {
            stats.staticData += 1;
            out[key] = null;
            continue;
        }
        if (key === 'pinData' && value && Object.keys(value).length > 0) {
            stats.pinData += 1;
            out[key] = {};
            continue;
        }
        out[key] = stripRuntimeState(value, stats);
    }
    return out;
}

/** Che nốt các chuỗi bí mật còn sót ngoài staticData (vd header ghi cứng). */
function redactRemainingSecrets(text, stats) {
    let result = text;
    for (const { name, re } of SECRET_PATTERNS) {
        result = result.replace(re, (match) => {
            stats.redacted.push(`${name} (${match.length} ký tự)`);
            return match.startsWith('Bearer ') ? `Bearer ${REDACTED}` : REDACTED;
        });
    }
    return result;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.input) {
        console.error('Thiếu file đầu vào.\n  node scripts/sanitize_n8n_export.js <file> [-o <file-ra>] [--check]');
        process.exit(2);
    }
    if (!fs.existsSync(args.input)) {
        console.error(`Không tìm thấy file: ${args.input}`);
        process.exit(2);
    }

    const raw = fs.readFileSync(args.input, 'utf8');
    let data;
    try {
        data = JSON.parse(raw);
    } catch (error) {
        console.error(`File không phải JSON hợp lệ: ${error.message}`);
        process.exit(2);
    }

    const stats = { staticData: 0, pinData: 0, redacted: [] };
    const cleaned = stripRuntimeState(data, stats);
    const output = redactRemainingSecrets(JSON.stringify(cleaned, null, 2), stats) + '\n';

    // Kiểm tra lại: sau khi lọc không được còn dấu vết bí mật nào.
    const leftovers = [];
    for (const { name, re } of SECRET_PATTERNS) {
        const found = output.match(re);
        if (found) leftovers.push(`${name} x${found.length}`);
    }

    console.log(`Nguồn: ${args.input} (${(raw.length / 1024).toFixed(0)} KB)`);
    console.log(`  staticData đã gỡ : ${stats.staticData}`);
    console.log(`  pinData đã gỡ    : ${stats.pinData}`);
    console.log(`  chuỗi đã che     : ${stats.redacted.length}`);
    for (const item of [...new Set(stats.redacted)]) console.log(`      - ${item}`);

    if (leftovers.length) {
        console.error(`\nVẪN CÒN DẤU VẾT BÍ MẬT SAU KHI LỌC: ${leftovers.join(', ')}`);
        console.error('Không ghi file. Hãy kiểm tra thủ công trước khi commit.');
        process.exit(1);
    }

    if (args.check) {
        console.log('\n--check: sạch, không ghi file.');
        return;
    }

    const outPath = args.output
        || path.join(path.dirname(args.input), path.basename(args.input, '.json') + '.safe.json');
    fs.writeFileSync(outPath, output, 'utf8');
    console.log(`\nĐã ghi bản sạch: ${outPath}`);
    console.log('Chỉ commit file này, đừng commit bản gốc.');
}

main();
