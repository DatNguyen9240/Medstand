#!/usr/bin/env node
/**
 * Kiểm tra frontend đã deploy có khớp với bản build ở local hay không.
 *
 * Vì sao cần: ngày 27/07/2026 medtest phục vụ ba nội dung khác nhau của
 * chatbot.bundle.min.js dưới cùng URL ?v=11.110, trong đó có một bản dính
 * marker conflict Git mà server vẫn trả HTTP 200 bình thường. Nhìn số version
 * hoặc Content-Length đều không phát hiện được. Chỉ so hash mới thấy.
 *
 * Dùng:
 *   node scripts/verify_frontend_deploy.js
 *   node scripts/verify_frontend_deploy.js https://medtest.bms7.net
 *
 * Thoát mã 0 nếu mọi thứ khớp, mã 1 nếu có bất kỳ sai lệch nào.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const BASE = (process.argv[2] || 'https://medtest.bms7.net').replace(/\/+$/, '');

// local path -> đường dẫn HTTP tương ứng
const ARTIFACTS = [
    ['index.html', '/'],
    ['src/js/dist/app.bundle.min.js', '/src/js/dist/app.bundle.min.js'],
    ['src/css/dist/app.bundle.min.css', '/src/css/dist/app.bundle.min.css'],
    ['chatbot-widget/js/chatbot.bundle.min.js', '/chatbot-widget/js/chatbot.bundle.min.js'],
    ['chatbot-widget/js/chatbot-core.bundle.min.js', '/chatbot-widget/js/chatbot-core.bundle.min.js'],
    ['pages/login.html', '/pages/login.html'],
    ['pages/forgot-password.html', '/pages/forgot-password.html'],
    ['sw.js', '/sw.js'],
];

const CONFLICT_RE = /^(<{7}|={7}|>{7})/m;

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
// Text asset có thể khác line-ending giữa worktree Windows (CRLF) và server (LF).
// So hash thô trước; chỉ khi lệch mới so bản chuẩn hóa để tránh báo lệch giả.
const normalise = (buf) => Buffer.from(buf.toString('utf8').replace(/\r/g, ''), 'utf8');

function appVersion() {
    const src = fs.readFileSync(path.join(ROOT, 'scripts', 'build.js'), 'utf8');
    const m = src.match(/const APP_VERSION = '([^']+)'/);
    return m ? m[1] : null;
}

async function main() {
    const version = appVersion();
    console.log(`Đối chiếu ${BASE} với bản build local`);
    console.log(`APP_VERSION local: ${version}\n`);

    let failed = 0;
    const rows = [];

    for (const [rel, urlPath] of ARTIFACTS) {
        const localPath = path.join(ROOT, rel);
        if (!fs.existsSync(localPath)) {
            rows.push([rel, 'THIẾU LOCAL', 'chưa build?']);
            failed += 1;
            continue;
        }

        let live;
        try {
            const res = await fetch(BASE + urlPath, { redirect: 'follow' });
            if (!res.ok) {
                rows.push([rel, `HTTP ${res.status}`, 'không tải được']);
                failed += 1;
                continue;
            }
            live = Buffer.from(await res.arrayBuffer());
        } catch (error) {
            rows.push([rel, 'LỖI MẠNG', error.message]);
            failed += 1;
            continue;
        }

        // Marker conflict quan trọng hơn hash: file kiểu này vẫn trả HTTP 200
        // nhưng không phải JS/HTML hợp lệ nên trang sẽ chết ngay.
        if (CONFLICT_RE.test(live.toString('utf8'))) {
            rows.push([rel, 'CONFLICT', 'file trên server dính marker Git — PHẢI deploy lại']);
            failed += 1;
            continue;
        }

        const local = fs.readFileSync(localPath);
        if (sha(local) === sha(live)) {
            rows.push([rel, 'KHỚP', '']);
        } else if (sha(normalise(local)) === sha(normalise(live))) {
            rows.push([rel, 'KHỚP', 'chỉ khác line-ending (CRLF/LF)']);
        } else {
            rows.push([rel, 'LỆCH', `local ${sha(local).slice(0, 12)}… vs live ${sha(live).slice(0, 12)}…`]);
            failed += 1;
        }
    }

    const w = Math.max(...ARTIFACTS.map(([rel]) => rel.length));
    for (const [name, status, note] of rows) {
        const icon = status === 'KHỚP' ? 'OK  ' : 'FAIL';
        console.log(`${icon} ${name.padEnd(w)}  ${status.padEnd(10)} ${note}`);
    }

    // Version hiển thị phải khớp APP_VERSION, nếu không thì trình duyệt cũ sẽ
    // giữ bundle cũ do Cache-Control: immutable.
    console.log('');
    try {
        const html = await (await fetch(BASE + '/')).text();
        const versions = [...new Set(html.match(/\?v=[\d.]+/g) || [])];
        const inline = (html.match(/appVersion = '([\d.]+)'/) || [])[1];
        const okV = versions.length === 1 && versions[0] === `?v=${version}` && inline === version;
        console.log(`${okV ? 'OK  ' : 'FAIL'} version trên server: ${versions.join(', ')} | appVersion=${inline} (local ${version})`);
        if (!okV) failed += 1;
    } catch (error) {
        console.log(`FAIL không đọc được index.html: ${error.message}`);
        failed += 1;
    }

    console.log('');
    if (failed) {
        console.error(`❌ ${failed} mục sai lệch — KHÔNG báo khách test cho tới khi deploy lại.`);
        process.exit(1);
    }
    console.log('✅ Toàn bộ khớp. Frontend trên server đúng bản build local.');
}

main();
