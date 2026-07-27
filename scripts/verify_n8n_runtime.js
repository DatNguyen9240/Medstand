#!/usr/bin/env node
/**
 * UAT-004 — đối chiếu workflow n8n đang chạy với file nguồn và manifest.
 *
 * Vì sao cần: nghiệm thu UAT-004 đòi hỏi "mỗi webhook chỉ có một workflow active
 * đúng; workflow runtime khớp file nguồn". Không nhìn được điều này từ source,
 * và n8n không lộ ra Internet, nên phải chạy script này ở nơi truy cập được n8n.
 *
 * Cách lấy file export (chạy trên máy có n8n):
 *   n8n export:workflow --all --output=runtime.json
 *
 * Rồi chạy:
 *   node scripts/verify_n8n_runtime.js runtime.json
 *
 * ⚠️ BẢO MẬT: file export chứa `staticData` — trong đó có token phiên đăng nhập
 * thật. TUYỆT ĐỐI không commit file này. Script chỉ đọc, không in giá trị
 * parameter nào ra màn hình. Xem thêm `scripts/sanitize_n8n_export.js`.
 *
 * Thoát mã 0 nếu đạt nghiệm thu, 1 nếu còn vi phạm.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// webhook path -> workflow ID đích, theo release/UAT_MANIFEST_2026-07-27_11.110.md
const EXPECTED = {
    'intent-parser': { id: 'Gn7nDjDgGUFOWni5', file: 'n8n/AI_Core/AI_Intent_Parser.json' },
    'hook-ai-dainao': { id: 'mQ2X8ubexBpqD3Ru', file: 'n8n/AI_Core/MAIN_ChatBot_V5.json' },
    'hook-ai-casual': { id: '5wgkVq7UJ2GQJ9BR', file: 'n8n/AI_Core/AI_ChatCasual.json' },
    'hook-ai-rag': { id: 'actVwBhqMGLQ6cSH', file: 'n8n/AI_Core/AI_RAG_Query.json' },
    'hook-ai-reviewer': { id: 'K2fHIkZIyZjfRkSL', file: 'n8n/AI_Core/AI_Reviewer.json' },
    'admin-upload': { id: 'HQa6xx7flcNcC1oU', file: 'n8n/AI_Core/AI_Upload_Reader.json' },
    'approve-catalog': { id: 'HQa6xx7flcNcC1oU', file: 'n8n/AI_Core/AI_Upload_Reader.json' },
    'api-datasource': { id: 'qMD8DESZ8pXRqrMR', file: 'n8n/API_Services/API_DataSource.json' },
    'api-execute': { id: 'fCJwiyAT9r6eh1ys', file: 'n8n/API_Services/API_Execute.json' },
    'api-get-config': { id: 'sGPz8LMQQHVp0IiL', file: 'n8n/API_Services/API_GetConfig.json' },
    'api-list-active': { id: 'FRbuGdI9jz0ZZIvU', file: 'n8n/API_Services/API_ListActive.json' },
    'api-get-system-meta': { id: 'YAiRyFqcyVmMU5c3', file: 'n8n/API_Services/API_SystemMeta.json' },
};
const GUARD_ID = '9UxECqxRaPGMF8EM'; // Shared_Auth_Guard, sub-workflow không webhook

const hooksOf = (wf) => (wf.nodes || [])
    .filter((n) => n.type === 'n8n-nodes-base.webhook')
    .map((n) => (n.parameters && n.parameters.path) || '')
    .filter(Boolean);

/**
 * So node + connections giữa runtime và source, bỏ qua metadata do n8n tự sinh.
 * Trả về danh sách mô tả khác biệt (chỉ tên node / khóa parameter, KHÔNG in giá trị).
 */
function diffWorkflow(runtime, source) {
    const out = [];
    const rn = new Map((runtime.nodes || []).map((n) => [n.name, n]));
    const sn = new Map((source.nodes || []).map((n) => [n.name, n]));

    for (const name of sn.keys()) if (!rn.has(name)) out.push('thiếu node trên runtime: ' + name);
    for (const name of rn.keys()) if (!sn.has(name)) out.push('runtime có node lạ: ' + name);

    for (const [name, s] of sn) {
        const r = rn.get(name);
        if (!r) continue;
        if (r.type !== s.type) out.push('node "' + name + '" khác type');
        const rp = JSON.stringify(r.parameters || {});
        const sp = JSON.stringify(s.parameters || {});
        if (rp !== sp) out.push('node "' + name + '" khác parameters');
        if ((r.onError || '') !== (s.onError || '')) out.push('node "' + name + '" khác onError');
        if (Boolean(r.retryOnFail) !== Boolean(s.retryOnFail)) out.push('node "' + name + '" khác retryOnFail');
    }

    if (JSON.stringify(runtime.connections || {}) !== JSON.stringify(source.connections || {})) {
        out.push('sơ đồ connections khác nhau');
    }
    return out;
}

function main() {
    const input = process.argv[2];
    if (!input) {
        console.error('Thiếu file export.\n  n8n export:workflow --all --output=runtime.json');
        console.error('  node scripts/verify_n8n_runtime.js runtime.json');
        process.exit(2);
    }
    if (!fs.existsSync(input)) { console.error('Không tìm thấy: ' + input); process.exit(2); }

    let raw;
    try { raw = JSON.parse(fs.readFileSync(input, 'utf8')); }
    catch (e) { console.error('File không phải JSON hợp lệ: ' + e.message); process.exit(2); }

    const list = Array.isArray(raw) ? raw : (raw.data || raw.workflows || []);
    console.log('Bản export runtime: ' + list.length + ' workflow\n');

    let fail = 0;

    // ── 1. Mỗi webhook chỉ được có đúng một workflow active ──────────────
    const byPath = {};
    for (const w of list) for (const p of hooksOf(w)) (byPath[p] = byPath[p] || []).push(w);

    console.log('=== 1. Mỗi webhook chỉ một workflow ACTIVE ===');
    for (const [p, want] of Object.entries(EXPECTED)) {
        const ws = byPath[p] || [];
        const act = ws.filter((w) => w.active);
        let line;
        if (!ws.length) { line = 'FAIL  không có workflow nào cho webhook này'; fail++; }
        else if (act.length === 0) { line = 'FAIL  có ' + ws.length + ' workflow nhưng không cái nào active'; fail++; }
        else if (act.length > 1) { line = 'FAIL  ' + act.length + ' workflow cùng active: ' + act.map((w) => w.id).join(', '); fail++; }
        else if (act[0].id !== want.id) { line = 'FAIL  active sai ID: ' + act[0].id + ' (cần ' + want.id + ')'; fail++; }
        else line = 'OK    ' + want.id;
        console.log('  ' + p.padEnd(22) + ' ' + line);

        const idle = ws.filter((w) => !w.active);
        if (idle.length) {
            console.log('        (còn ' + idle.length + ' bản inactive nên dọn: ' + idle.map((w) => w.id).join(', ') + ')');
        }
    }

    // ── 2. Workflow runtime khớp file nguồn ──────────────────────────────
    console.log('\n=== 2. Runtime khớp file nguồn ===');
    const seen = new Set();
    for (const want of Object.values(EXPECTED)) {
        if (seen.has(want.id)) continue;
        seen.add(want.id);

        const rt = list.find((w) => w.id === want.id);
        const srcPath = path.join(ROOT, want.file);
        if (!rt) { console.log('  FAIL  ' + want.file.padEnd(42) + ' không thấy workflow ' + want.id + ' trên runtime'); fail++; continue; }
        if (!fs.existsSync(srcPath)) { console.log('  FAIL  ' + want.file + ' không có trong repo'); fail++; continue; }

        const src = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
        const d = diffWorkflow(rt, src);
        if (!d.length) console.log('  OK    ' + want.file.padEnd(42) + ' (' + (rt.nodes || []).length + ' node)');
        else {
            fail++;
            console.log('  FAIL  ' + want.file.padEnd(42) + ' ' + d.length + ' khác biệt:');
            for (const x of d.slice(0, 8)) console.log('          - ' + x);
            if (d.length > 8) console.log('          - … còn ' + (d.length - 8) + ' khác biệt nữa');
        }
    }

    // ── 3. Shared Auth Guard phải tồn tại và gọi được ────────────────────
    console.log('\n=== 3. Shared Auth Guard ===');
    const guard = list.find((w) => w.id === GUARD_ID);
    if (!guard) { console.log('  FAIL  không thấy ' + GUARD_ID + ' trên runtime'); fail++; }
    else console.log('  OK    ' + GUARD_ID + ' có mặt (active=' + guard.active + '; sub-workflow nên active bất kỳ đều được, miễn gọi được)');

    // ── 4. Cảnh báo bảo mật ──────────────────────────────────────────────
    const withStatic = list.filter((w) => w.staticData && Object.keys(w.staticData).length).length;
    if (withStatic) {
        console.log('\n⚠️  ' + withStatic + ' workflow trong file export có staticData (có thể chứa token thật).');
        console.log('    KHÔNG commit file này. Cần lưu thì lọc trước:');
        console.log('    node scripts/sanitize_n8n_export.js ' + input + ' -o safe.json');
    }

    console.log('');
    if (fail) { console.error('❌ UAT-004 chưa đạt: ' + fail + ' mục vi phạm.'); process.exit(1); }
    console.log('✅ UAT-004 đạt: mỗi webhook một workflow active đúng, runtime khớp file nguồn.');
}

main();
