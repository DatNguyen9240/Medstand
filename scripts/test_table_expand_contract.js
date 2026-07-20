const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'chatbot-widget/js/chatbot.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'chatbot-widget/css/chatbot.css'), 'utf8');

const checks = [
  ['table renderer accepts expanded state', /function _renderTableBody\(filteredRows, keys, forceShowAll, apiCode, showAllRows\)/.test(js)],
  ['initial table remains capped at 50 rows', /showAllRows \? filteredRows\.length : Math\.min\(filteredRows\.length, MAX\)/.test(js)],
  ['show-more button exposes hidden row count', /Xem thêm ' \+ \(filteredRows\.length - MAX\) \+ ' dòng'/.test(js)],
  ['collapse action is rendered', /data-table-page-action/.test(js) && /Thu gọn/.test(js)],
  ['delegated click expands and collapses', /closest\('\.ai-table-page-btn'\)/.test(js) && /showAllRows = tablePageBtn\.getAttribute\('data-table-page-action'\) === 'expand'/.test(js)],
  ['filtered rows are preserved for expansion', /visibleRows: rows/.test(js) && /cached\.visibleRows = filtered/.test(js)],
  ['pagination button has visible focus styling', /\.ai-table-page-btn:focus-visible/.test(css)],
  ['legacy non-clickable footer removed', !/\.\.\. và ' \+ \(filteredRows\.length - MAX\) \+ ' dòng khác/.test(js)]
];

const failed = checks.filter(([, pass]) => !pass);
for (const [name, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}`);
}

if (failed.length) {
  process.exitCode = 1;
} else {
  console.log(`TABLE_EXPAND_CONTRACT_PASS (${checks.length} checks)`);
}
