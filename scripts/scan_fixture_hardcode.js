'use strict';

/* CUSTOMER-UAT-001 — quét mã fixture/mock bị hard-code trong SOURCE RUNTIME.

     node scripts/scan_fixture_hardcode.js
     node scripts/scan_fixture_hardcode.js --token=KH12345 --token=SP999
     node scripts/scan_fixture_hardcode.js --json > reports/hardcode.json

   Nguyên tắc phân loại (đây là phần dễ báo cáo sai nhất, nên viết rõ ra):

   - RUNTIME  : code quyết định hành vi thật của UI/API/gateway/SQL procedure.
                Một mã fixture nằm ở đây, ngoài comment => LỖI, script trả exit code 1.
   - AUTOMATION: workflow n8n / prompt AI. Mã fixture ở đây thường là ví dụ trong prompt,
                không quyết định phân quyền hay dữ liệu, nên chỉ CẢNH BÁO để người đọc tự xét.
   - DERIVED  : src/js/dist — sản phẩm build từ src/js. Trùng lặp với RUNTIME, chỉ đếm.
   - DATA     : script seed/mock/migration gắn dữ liệu cụ thể vào bảng cấu hình.
                KHÔNG phải lỗi code, nhưng là PHỤ THUỘC MÔI TRƯỜNG: tài khoản mới sẽ
                không có dòng cấu hình tương ứng. Bắt buộc ghi vào manifest UAT.
   - TEST/DOC : script kiểm thử, deploy, tài liệu. Hợp lệ, chỉ đếm cho đủ bức tranh.

   Script này KHÔNG sửa gì, chỉ đọc file. */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

/* Mã mẫu đang được dùng trong quá trình phát triển. Thêm bằng --token=... khi đội test
   sinh định danh mới mà vẫn muốn chắc chắn nó không lọt vào source. */
const DEFAULT_TOKENS = [
  'demo',
  'DEMO_KH',
  'DL011',
  'HPA011',
  'A008',
  'ONL1136',
  'UATV2_',
  'U13S1_',
  'DMB0826/',
  'xyz99999',
];

/* Bỏ hẳn: thư mục của bên thứ ba và bản chụp/backup. Quét chúng chỉ tạo nhiễu — chúng không
   phải source của Medstand và không quyết định hành vi nghiệp vụ. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.vscode', 'release', 'reports', 'coverage',
  'n8n_data', '.cache', 'snapshots', '.runtime-backups',
]);
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.sql', '.html', '.htm', '.css', '.json', '.md', '.ps1', '.bat']);

/* Tên file SQL mang tính seed/mock/migration dữ liệu. Nhận diện bằng tên + nội dung:
   file SQL nào có CREATE OR ALTER PROCEDURE/FUNCTION/VIEW/TRIGGER thì vẫn là RUNTIME. */
const SQL_DATA_NAME = /(mock|seed|insert_|add_uat|cleanup|fix_uat|audit_uat|migrate_|deploy_|bootstrap_|enable_test)/i;
const SQL_RUNTIME_OBJECT = /CREATE\s+(OR\s+ALTER\s+)?(PROCEDURE|PROC|FUNCTION|VIEW|TRIGGER)/i;

function classifyZone(relPath, source) {
  const p = relPath.replace(/\\/g, '/');

  if (p.startsWith('docs/')) return 'DOC';
  if (p.startsWith('scripts/')) return 'TEST';
  if (p.startsWith('src/js/dist/')) return 'DERIVED';
  if (p.startsWith('n8n/') || p.startsWith('n8n-system/')) return 'AUTOMATION';
  if (p === 'index.dev.html') return 'TEST';

  if (p.startsWith('sql/')) {
    if (SQL_RUNTIME_OBJECT.test(source)) return 'RUNTIME';
    if (SQL_DATA_NAME.test(path.basename(p))) return 'DATA';
    return 'DATA';
  }

  if (p.startsWith('src/js/') || p.startsWith('src/server/') || p.startsWith('src/pwa/')
      || p.startsWith('src/templates/') || p.startsWith('chatbot-widget/js/')
      || p.startsWith('pages/') || p.startsWith('config/')
      || p === 'server.js' || p === 'env.js' || p === 'sw.js'
      || p === 'index.html' || p === 'index.prod.html') {
    return 'RUNTIME';
  }

  return 'OTHER';
}

/* Comment detection cố ý đơn giản: chỉ xét ĐẦU DÒNG. Không parse ngôn ngữ, nên một token
   nằm trong comment cuối dòng code vẫn bị tính là RUNTIME — nhầm theo hướng an toàn. */
function looksLikeComment(line, ext) {
  const trimmed = line.trim();
  if (trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('<!--')) return true;
  if ((ext === '.js' || ext === '.ts' || ext === '.mjs' || ext === '.cjs' || ext === '.css') && trimmed.startsWith('//')) return true;
  if (ext === '.sql' && trimmed.startsWith('--')) return true;
  return false;
}

function tokenPattern(token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  /* Chỉ thêm \b khi hai đầu token là ký tự chữ/số, nếu không \b sẽ không khớp
     (vd 'UATV2_' kết thúc bằng '_', 'DMB0826/' kết thúc bằng '/'). */
  const left = /^[A-Za-z0-9]/.test(token) ? '\\b' : '';
  const right = /[A-Za-z0-9]$/.test(token) ? '\\b' : '';
  return new RegExp(left + escaped + right, 'gi');
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if (TEXT_EXT.has(path.extname(entry.name).toLowerCase())) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function main() {
  const extraTokens = process.argv
    .filter((a) => a.startsWith('--token='))
    .map((a) => a.slice('--token='.length))
    .filter(Boolean);
  const tokens = DEFAULT_TOKENS.concat(extraTokens);
  const patterns = tokens.map((t) => ({ token: t, re: tokenPattern(t) }));

  const files = walk(root, []);
  const findings = [];
  const commentOnly = [];
  const otherZones = {};

  for (const absolute of files) {
    const relPath = path.relative(root, absolute).replace(/\\/g, '/');
    let source;
    try {
      source = fs.readFileSync(absolute, 'utf8');
    } catch (error) {
      continue;
    }
    if (source.indexOf(String.fromCharCode(0)) !== -1) continue; /* bỏ qua file nhị phân */

    const zone = classifyZone(relPath, source);
    const ext = path.extname(relPath).toLowerCase();
    const lines = source.split(/\r?\n/);

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      for (const { token, re } of patterns) {
        re.lastIndex = 0;
        if (!re.test(line)) continue;

        const hit = {
          Zone: zone,
          Token: token,
          Location: `${relPath}:${i + 1}`,
          Snippet: line.trim().slice(0, 160),
        };

        if (zone === 'RUNTIME') {
          if (looksLikeComment(line, ext)) commentOnly.push(hit);
          else findings.push(hit);
        } else if (zone === 'AUTOMATION') {
          if (!looksLikeComment(line, ext)) findings.push(Object.assign({ Severity: 'REVIEW' }, hit));
        } else {
          const key = `${zone} · ${relPath}`;
          otherZones[key] = (otherZones[key] || 0) + 1;
        }
        break; /* mỗi dòng chỉ báo một lần, tránh nhân bản khi trùng nhiều token */
      }
    }
  }

  const blocking = findings.filter((f) => f.Severity !== 'REVIEW');
  const report = {
    Task: 'CUSTOMER-UAT-001-HARDCODE-SCAN',
    Status: blocking.length ? 'FAIL' : 'PASS',
    ScannedFiles: files.length,
    Tokens: tokens,
    RuntimeFindings: blocking,
    ReviewFindings: findings.filter((f) => f.Severity === 'REVIEW'),
    RuntimeCommentOnly: commentOnly,
    IgnoredZones: Object.keys(otherZones).sort().map((k) => ({ File: k, Hits: otherZones[k] })),
    Note: blocking.length
      ? 'Có mã fixture nằm trong source runtime ngoài comment. Phải xử lý trước khi tuyên bố UAT độc lập dữ liệu.'
      : 'Không có mã fixture nào quyết định hành vi runtime. Các hit còn lại nằm ở seed/test/tài liệu hoặc comment.',
    Reminder: 'Zone DATA là phụ thuộc MÔI TRƯỜNG (dòng cấu hình gắn với tài khoản/khách cụ thể), '
      + 'không phải lỗi code nhưng phải ghi vào manifest UAT — tài khoản mới sẽ không có những dòng đó.',
  };

  console.log(JSON.stringify(report, null, 2));
  if (blocking.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ Task: 'CUSTOMER-UAT-001-HARDCODE-SCAN', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
}
