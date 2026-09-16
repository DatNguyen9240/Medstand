'use strict';

const fs = require('fs');

const chatbot = fs.readFileSync('chatbot-widget/js/chatbot.js', 'utf8');

const checks = [
  ['CORE007_TIER_FILTER_A', chatbot.includes('<option value="A">Nhóm A</option>')],
  ['CORE007_TIER_FILTER_B', chatbot.includes('<option value="B">Nhóm B</option>')],
  ['CORE007_TIER_FILTER_C', chatbot.includes('<option value="C">Nhóm C</option>')],
  ['CORE007_TIER_FILTER_UNRATED', chatbot.includes('<option value="UNRATED">Chưa đủ dữ liệu</option>')],
  ['CORE007_RISK_FILTER_INDEPENDENT', chatbot.includes('data-tier-filter="risk"') && chatbot.includes("params['@RiskLevel']")],
  ['CORE007_TIER_FILTER_SERVER_PARAM', chatbot.includes("params['@NhomFilter']")],
  ['CORE007_TIER_AND_RISK_VISIBLE', chatbot.includes("row.Nhom || row.ValueSegment") && chatbot.includes('row.RiskLevel')],
  ['CORE007_UNKNOWN_FRIENDLY', chatbot.includes('Chưa đủ dữ liệu rủi ro')],
  ['CORE008_LAST_PURCHASE_VISIBLE', chatbot.includes("_formatBusinessCell('LanMuaCuoiDate'")],
  ['CORE008_EXPECTED_DATE_VISIBLE', chatbot.includes("_formatBusinessCell('NgayDuKien'")],
  ['CORE008_REMAINING_DAYS_VISIBLE', chatbot.includes('row.ConLaiNgay')],
  ['CORE008_CYCLE_MODE_VISIBLE', chatbot.includes('row.CycleComputationMode')],
  ['CORE008_REASON_VISIBLE', chatbot.includes('row.ReasonText')],
  ['CORE008_REASON_CODES_TRANSLATED', chatbot.includes('_translateRecommendationReasons(row.RecommendationReasonCodes')],
  ['CORE008_RULE_SOURCE_VISIBLE', chatbot.includes('row.RuleSourceLabel')],
  ['CORE008_NO_HISTORY_FRIENDLY', chatbot.includes('Chưa thể xác định')],
];

const failed = checks.filter(([, pass]) => !pass);
for (const [name, pass] of checks) console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
console.log(`PHASE1 visual contracts: ${failed.length ? 'FAIL' : 'PASS'} ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exitCode = 1;
