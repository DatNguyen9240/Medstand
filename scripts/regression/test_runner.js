/**
 * Bộ điều phối thực thi kiểm thử (Test Runner Engine)
 */
const config = require('./config');
const assertions = require('./assertions');
const testCases = require('./test_cases');
const jsonReporter = require('./reporters/json_reporter');
const markdownReporter = require('./reporters/markdown_reporter');

async function testLogin(username) {
    try {
        const res = await fetch('https://medtest.bms79.com/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, password: '123456' })
        });
        if (res.status === 200) {
            const json = await res.json();
            if (json && json.code === 0 && json.access_token) {
                return `Bearer ${json.access_token}`;
            }
        }
    } catch (e) {
        console.error(`Login failed for ${username}:`, e.message);
    }
    return null;
}

async function run() {
    // 1. Phân tích đối số dòng lệnh (CLI Arguments)
    const args = process.argv.slice(2);
    let mode = 'all'; // 'all', 'suite', 'case'
    let targetValue = null;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--all') {
            mode = 'all';
        } else if (args[i] === '--suite') {
            mode = 'suite';
            targetValue = args[i + 1];
            i++;
        } else if (args[i].startsWith('--suite=')) {
            mode = 'suite';
            targetValue = args[i].split('=')[1];
        } else if (args[i] === '--case') {
            mode = 'case';
            targetValue = args[i + 1];
            i++;
        } else if (args[i].startsWith('--case=')) {
            mode = 'case';
            targetValue = args[i].split('=')[1];
        }
    }

    // 2. Lọc các kịch bản kiểm thử tương ứng
    let selectedCases = [];
    if (mode === 'suite') {
        selectedCases = testCases.filter(c => c.suite.toLowerCase() === String(targetValue).toLowerCase());
        console.log(`\n🔍 Đã lọc theo Suite: "${targetValue}" (${selectedCases.length} cases found)`);
    } else if (mode === 'case') {
        selectedCases = testCases.filter(c => String(c.id) === String(targetValue));
        console.log(`\n🔍 Đã lọc theo Case ID: "${targetValue}" (${selectedCases.length} cases found)`);
    } else {
        selectedCases = testCases;
        console.log(`\n🔍 Đang chạy toàn bộ kịch bản kiểm thử (${selectedCases.length} cases)`);
    }

    if (selectedCases.length === 0) {
        console.log('❌ Không tìm thấy kịch bản kiểm thử nào trùng khớp.');
        process.exit(1);
    }

    const results = [];
    const summary = {
        total: selectedCases.length,
        passed: 0,
        failed: 0,
        skipped: 0,
        warning: 0
    };

    console.log('🔑 Đang đăng nhập lấy token thực tế từ UAT server...');
    const adminToken = await testLogin('admin');
    const northToken = await testLogin('NAMDINHB.MED');
    const centralToken = await testLogin('HUEB.MED');
    const southToken = await testLogin('CanThoA');

    if (adminToken) {
        config.ACCOUNTS.ADMIN.Token = adminToken;
    }
    if (northToken) {
        config.SIMULATED_TOKEN = northToken;
        config.ACCOUNTS.NORTH.Token = northToken;
    }
    if (centralToken) {
        config.ACCOUNTS.CENTRAL.Token = centralToken;
    }
    if (southToken) {
        config.ACCOUNTS.SOUTH.Token = southToken;
    }
    console.log('✅ Đã nhận được các token UAT thực tế.');

    console.log('========================================================================');
    console.log(`🚀 BẮT ĐẦU CHẠY KIỂM THỬ HỒI QUY MEDSTAND AI`);
    console.log(`   API Endpoint Target: ${config.API_BASE}`);
    console.log('========================================================================\n');

    // 3. Thực thi từng kịch bản kiểm thử
    for (const tc of selectedCases) {
        console.log(`[CASE #${tc.id}] [${tc.suite.toUpperCase()}] ${tc.name}...`);
        
        let status = 'PENDING';
        let elapsedMs = 0;
        let lastError = null;
        let responseData = null;
        let runSuccess = false;

        const startTime = Date.now();

        // Thử lại nếu là Chatbot API gặp sự cố hoặc timeout
        for (let retry = 0; retry <= config.MAX_RETRIES; retry++) {
            if (retry > 0) {
                console.log(`   ⚠️ Lần thử thứ ${retry}...`);
            }

            try {
                // Sử dụng Promise.race để cài đặt Timeout 30 giây
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error(`Kịch bản kiểm thử bị treo quá hạn ${config.TIMEOUT_MS / 1000}s`)), config.TIMEOUT_MS);
                });

                const runPromise = tc.run(config, assertions);
                const res = await Promise.race([runPromise, timeoutPromise]);
                
                responseData = res;
                runSuccess = true;
                break; // Thành công thì thoát khỏi vòng lặp retry
            } catch (err) {
                lastError = err;
                
                // Nếu là lỗi kết nối mạng (Server offline), bỏ qua không cần retry
                if (err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed') || err.message.includes('fetch is not defined')) {
                    break;
                }
            }
        }

        elapsedMs = Date.now() - startTime;

        if (runSuccess) {
            status = 'PASSED';
            summary.passed++;
            console.log(`   🟢 PASSED (${elapsedMs}ms)`);
            if (responseData && responseData.response) {
                const snippet = typeof responseData.response === 'string' 
                    ? responseData.response.substring(0, 100) 
                    : JSON.stringify(responseData.response).substring(0, 100);
                console.log(`   Response snippet: "${snippet.trim()}..."`);
            }
        } else {
            // Xác định phân loại lỗi
            const errStr = lastError ? lastError.message : 'Unknown error';
            
            if (errStr.includes('ECONNREFUSED') || errStr.includes('fetch failed')) {
                status = 'SKIPPED';
                summary.skipped++;
                console.log(`   ⚪ SKIPPED (${elapsedMs}ms) - Lý do: Server offline hoặc cổng 3000 chưa mở.`);
            } else if (errStr.includes('[WARNING]') || errStr.includes('không chứa thông tin') || errStr.includes('thiếu các nội dung')) {
                status = 'WARNING';
                summary.warning++;
                console.log(`   🟡 WARNING (${elapsedMs}ms) - Chi tiết: ${errStr}`);
            } else {
                status = 'FAILED';
                summary.failed++;
                console.log(`   🔴 FAILED (${elapsedMs}ms) - Lý do: ${errStr}`);
            }
        }
        console.log('------------------------------------------------------------------------');

        results.push({
            id: tc.id,
            suite: tc.suite,
            name: tc.name,
            status,
            elapsedMs,
            error: lastError ? lastError.message : null,
            responseSnippet: responseData && responseData.response 
                ? (typeof responseData.response === 'string' ? responseData.response.substring(0, 200) : JSON.stringify(responseData.response).substring(0, 200))
                : null
        });
    }

    // 4. Tính toán tỷ lệ Pass Rate
    summary.passRate = summary.total > 0 
        ? (((summary.passed + summary.warning) / summary.total) * 100).toFixed(1)
        : '0.0';

    // 5. Xuất báo cáo kết quả
    const jsonFile = jsonReporter.generate(results, summary, config);
    const mdFile = markdownReporter.generate(results, summary, config);

    console.log('\n========================================================================');
    console.log(`🏁 HOÀN TẤT KIỂM THỬ HỒI QUY`);
    console.log(`   Tổng số: ${summary.total} | Passed: ${summary.passed} | Failed: ${summary.failed} | Warning: ${summary.warning} | Skipped: ${summary.skipped}`);
    console.log(`   Tỷ lệ vượt qua (Pass + Warning): ${summary.passRate}%`);
    console.log('========================================================================');
    console.log(`📁 File kết quả JSON: ${jsonFile}`);
    console.log(`📁 File báo cáo Markdown: ${mdFile}\n`);
}

module.exports = { run };
