'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const workflowPath = path.join(root, 'n8n', 'AI_Core', 'MAIN_ChatBot_V5.json');
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const normalizeNode = (workflow.nodes || []).find((node) => node.name === 'LIB NormalizeInput');
const formatNode = (workflow.nodes || []).find((node) => node.name === 'Format Response');

if (!normalizeNode || typeof normalizeNode.parameters?.jsCode !== 'string') {
  throw new Error('LIB NormalizeInput code is missing.');
}
if (!formatNode || typeof formatNode.parameters?.jsCode !== 'string') {
  throw new Error('Format Response code is missing.');
}

const code = normalizeNode.parameters.jsCode;
const routeStart = code.indexOf('  "@tuyen_ban_hang": {');
const routeEnd = code.indexOf('  "@danh_sach_tonkho": {', routeStart);

if (routeStart < 0 || routeEnd < 0) {
  throw new Error('The @tuyen_ban_hang quick-intent registry entry changed.');
}

const dailyPatterns = [
  'hom nay em nen lam gi',
  'hom nay toi nen lam gi',
  'hom nay tui nen lam gi',
  'hom nay can lam gi',
  'hom nay di dau',
  'hom nay ghe dau',
  'tuyen hom nay',
  'lich tuyen',
  '@tuyen_ban_hang',
];
const patternLiteral = `[${dailyPatterns.map((pattern) => `'${pattern}'`).join(', ')}]`;
let routeBlock = code.slice(routeStart, routeEnd);
routeBlock = routeBlock
  .replace(/permission:\s*\[[^\]]*\]/, 'permission: []')
  .replace(/patterns:\s*\[[^\]]*\]/, `patterns: ${patternLiteral}`);
if (/params:\s*\{[^}]*\}/.test(routeBlock)) {
  routeBlock = routeBlock.replace(/params:\s*\{[^}]*\}/, "params: { '@NgayTarget': '[TODAY]', '@TopN': 8 }");
} else {
  routeBlock = routeBlock.replace(/\n\s*\},\s*$/, ",\n    params: { '@NgayTarget': '[TODAY]', '@TopN': 8 }\n  },\n");
}
normalizeNode.parameters.jsCode = code.slice(0, routeStart) + routeBlock + code.slice(routeEnd);

if (!normalizeNode.parameters.jsCode.includes("'hom nay em nen lam gi'")) {
  throw new Error('Daily-work natural-language pattern was not installed.');
}
if (!normalizeNode.parameters.jsCode.includes("params: { '@NgayTarget': '[TODAY]', '@TopN': 8 }")) {
  throw new Error('Daily-work route parameters were not installed.');
}
if (!/"@tuyen_ban_hang":\s*\{[\s\S]*?permission:\s*\[\]/.test(normalizeNode.parameters.jsCode)) {
  throw new Error('Daily-work route authorization was not delegated to the canonical API gateway.');
}

if (!formatNode.parameters.jsCode.includes('DAILY_WORK_NO_DATA')) {
  const noDataAnchor = "const data = Array.isArray(k.data) ? k.data : [];";
  if (!formatNode.parameters.jsCode.includes(noDataAnchor)) {
    throw new Error('Format Response no-data anchor changed.');
  }
  formatNode.parameters.jsCode = formatNode.parameters.jsCode.replace(
    noDataAnchor,
    `${noDataAnchor}\n// DAILY_WORK_NO_DATA: keep an empty scoped route useful without inventing customers.\nconst dailyNoDataMessage = apiCode === '@tuyen_ban_hang'\n  ? 'Dạ, hôm nay chưa có khách nào đạt điều kiện ưu tiên trong phạm vi của anh/chị. Anh/chị có thể kiểm tra công nợ hoặc chọn một khách để xem gợi ý đơn hàng.'\n  : 'Dạ, hệ thống hiện không tìm thấy dữ liệu phù hợp.';`,
  );
  formatNode.parameters.jsCode = formatNode.parameters.jsCode.replace(
    /message:useRag \? '' : \(k\.message \|\| '[^']*'\)/,
    "message:useRag ? '' : (k.message || dailyNoDataMessage)",
  );
}
formatNode.parameters.jsCode = formatNode.parameters.jsCode.replace(
  "message:useRag ? '' : (k.message || dailyNoDataMessage)",
  "message:useRag ? '' : (apiCode === '@tuyen_ban_hang' ? dailyNoDataMessage : (k.message || dailyNoDataMessage))",
);
if (!formatNode.parameters.jsCode.includes("apiCode === '@tuyen_ban_hang'")) {
  throw new Error('Daily-work no-data guidance was not installed.');
}

fs.writeFileSync(workflowPath, `${JSON.stringify(workflow, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: 'DAILY_WORK_QUICK_INTENT_APPLIED',
  phrase: 'Hôm nay em nên làm gì?',
  apiCode: '@tuyen_ban_hang',
  params: { '@NgayTarget': '[TODAY]', '@TopN': 8 },
}, null, 2));
