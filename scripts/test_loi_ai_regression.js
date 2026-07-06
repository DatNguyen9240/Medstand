#!/usr/bin/env node
/**
 * MEDSTAND REGRESSION TEST ENTRYPOINT
 * Hướng dẫn chạy:
 *   node scripts/test_loi_ai_regression.js --all          Chạy toàn bộ 13 test case
 *   node scripts/test_loi_ai_regression.js --suite chatbot Chạy riêng suite chatbot
 *   node scripts/test_loi_ai_regression.js --suite api     Chạy riêng suite API
 *   node scripts/test_loi_ai_regression.js --suite static  Chạy riêng suite static audit
 *   node scripts/test_loi_ai_regression.js --case 7        Chạy riêng test case số 7
 */

const runner = require('./regression/test_runner');

runner.run().catch(err => {
    console.error('❌ Lỗi nghiêm trọng khi thực thi kiểm thử hồi quy:', err);
    process.exit(1);
});
