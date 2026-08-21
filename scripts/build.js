const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const APP_VERSION = '11.144';

function writeFileWithRetry(filePath, content, encoding = 'utf-8', attempts = 5) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            fs.writeFileSync(filePath, content, encoding);
            return;
        } catch (error) {
            const retryable = ['UNKNOWN', 'EPERM', 'EBUSY', 'EACCES'].includes(error.code);
            if (!retryable || attempt === attempts) throw error;
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 150);
        }
    }
}

// Bộ nén CSS bằng regex siêu nhẹ, không phụ thuộc package ngoài
function minifyCSS(cssContent) {
    // Rút comment và chuỗi ra TRONG CÙNG MỘT LƯỢT QUÉT, trước khi bóp khoảng trắng.
    //
    // Vì sao phải giữ nguyên chuỗi: các regex bên dưới không phân biệt được đâu là cú
    // pháp CSS, đâu là nội dung chuỗi. Để nguyên thì [style*="display: none"] bị bóp
    // thành [style*="display:none"], không còn khớp style="display: none;" trong DOM
    // — selector chết âm thầm ở bản production. Cũng bảo vệ luôn content:"a: b",
    // url("...").
    //
    // Vì sao phải quét chung một lượt: dấu nháy đơn trong comment tiếng Anh (vd
    // "it doesn't contribute") sẽ bị hiểu nhầm là mở chuỗi và nuốt luôn dấu */ đóng
    // comment, làm bước xóa comment ăn lan sang các rule phía sau. Quét một lượt thì
    // cái nào bắt đầu trước thắng: comment nuốt trọn nháy bên trong, và ngược lại
    // chuỗi nuốt trọn /* bên trong.
    const MARK = '\u0000'; // Không xuất hiện trong CSS và không bị \s nuốt
    const literals = [];

    const guarded = cssContent.replace(
        /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g,
        (match) => (match.startsWith('/*')
            ? ''                                            // Xóa comment
            : `${MARK}L${literals.push(match) - 1}${MARK}`) // Giữ nguyên chuỗi
    );

    return guarded
        .replace(/\s+/g, ' ')                // Gộp khoảng trắng
        .replace(/\s*([\{\}:;,])\s*/g, '$1') // Xóa khoảng trắng thừa quanh cấu trúc CSS
        .replace(/;}/g, '}')                 // Xóa dấu chấm phẩy thừa cuối block
        .trim()
        .replace(new RegExp(`${MARK}L(\\d+)${MARK}`, 'g'), (m, i) => literals[Number(i)]);
}

// Hàm dọn dẹp thư mục cũ
function cleanDirectory(dirPath) {
    if (fs.existsSync(dirPath)) {
        console.log(`[Clean] Đang dọn dẹp thư mục: ${dirPath}`);
        fs.rmSync(dirPath, { recursive: true, force: true });
    }
    fs.mkdirSync(dirPath, { recursive: true });
}

// Gom chatbot ES6 modules thành plain JS động
function bundleES6Modules(filePaths) {
    let combined = '';
    for (const filePath of filePaths) {
        const absolutePath = path.join(__dirname, '..', filePath);
        if (!fs.existsSync(absolutePath)) {
            console.warn(`[Warn] Không tìm thấy file ES6 module: ${absolutePath}`);
            continue;
        }
        let code = fs.readFileSync(absolutePath, 'utf-8');
        
        // Loại bỏ import
        code = code.replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, '');
        // Loại bỏ export đầu dòng
        code = code.replace(/\bexport\s+(const|let|var|function|class|async\s+function)\b/g, '$1');
        // Loại bỏ export { ... } cuối file
        code = code.replace(/\bexport\s+\{\s*[\s\S]*?\s*\};?/g, '');
        
        combined += `\n/* --- Bundled: ${filePath} --- */\n` + code + '\n';
    }
    // Bọc toàn bộ trong IIFE để tránh ô nhiễm global namespace và bảo mật tốt hơn
    return `(function() {\n${combined}\n})();`;
}

async function build() {
    console.log('===================================================');
    console.log('🚀 MEDSTAND ENTERPRISE FRONTEND BUNDLER & MINIFIER');
    console.log('===================================================');

    // ─── 0. DỌN DẸP BUILD ARTIFACTS CŨ ───
    const jsDistDir = path.join(__dirname, '../src/js/dist');
    const cssDistDir = path.join(__dirname, '../src/css/dist');
    const chatbotCssDistDir = path.join(__dirname, '../chatbot-widget/css/dist');
    const pagesJsDistDir = path.join(__dirname, '../src/js/dist/pages');
    const cssPagesDistDir = path.join(__dirname, '../src/css/dist/pages');
    const cssComponentsDistDir = path.join(__dirname, '../src/css/dist/components');

    cleanDirectory(jsDistDir);
    cleanDirectory(cssDistDir);
    cleanDirectory(chatbotCssDistDir);
    cleanDirectory(pagesJsDistDir);
    cleanDirectory(cssPagesDistDir);
    cleanDirectory(cssComponentsDistDir);

    const htmlPath = path.join(__dirname, '../index.dev.html');
    if (!fs.existsSync(htmlPath)) {
        console.error('Lỗi: Không tìm thấy file index.dev.html!');
        process.exit(1);
    }

    let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

    // ─── 1. ĐÓNG GÓI JAVASCRIPT HỆ THỐNG ───
    const scriptRegex = /<script\s+[^>]*src=["'](src\/js\/[^"']+)["'][^>]*><\/script>/gi;
    let match;
    const scriptPaths = [];
    const scriptTags = [];

    while ((match = scriptRegex.exec(htmlContent)) !== null) {
        const fullTag = match[0];
        const scriptPathWithQuery = match[1];
        const realPath = scriptPathWithQuery.split('?')[0];
        
        // Bỏ qua theme.js để nó chạy độc lập trong head tránh lỗi giật màn hình
        if (realPath.includes('theme.js')) {
            continue;
        }

        scriptPaths.push(realPath);
        scriptTags.push(fullTag);
    }

    console.log(`Đã phát hiện ${scriptPaths.length} scripts nội bộ để đóng gói.`);

    let concatenatedJS = '';

    // Đưa cấu hình env.js vào đầu bundle JS để ẩn giấu và làm rối toàn bộ
    const envJsPath = path.join(__dirname, '../env.js');
    if (fs.existsSync(envJsPath)) {
        concatenatedJS += `\n/* --- BUNDLED JS: env.js --- */\n`;
        concatenatedJS += fs.readFileSync(envJsPath, 'utf-8') + '\n';
    }

    for (const p of scriptPaths) {
        const absolutePath = path.join(__dirname, '..', p);
        if (fs.existsSync(absolutePath)) {
            let fileContent = fs.readFileSync(absolutePath, 'utf-8');
            
            // Rewrite đường dẫn động của SPA Router ngay tại thời điểm build (Build-time rewrite)
            if (p.includes('router.js')) {
                console.log('[Router] Thực hiện ánh xạ đường dẫn sang dist tại build-time...');
                fileContent = fileContent
                    .replace(/src\/js\/pages\//g, 'src/js/dist/pages/')
                    .replace(/src\/css\//g, 'src/css/dist/')
                    .replace(/chatbot-widget\/css\//g, 'chatbot-widget/css/dist/')
                    .replace(/\?v=\d+\.\d+/g, `?v=${APP_VERSION}`);
            }

            concatenatedJS += `\n/* --- BUNDLED JS: ${p} --- */\n`;
            concatenatedJS += fileContent + '\n';
        } else {
            console.warn(`Cảnh báo: Không tìm thấy file ${absolutePath}`);
        }
    }

    // --- 1B. AUTO STRING OBFUSCATION (MÃ HÓA ẨN GIẤU 100% API/WEBHOOK PATHS) ---
    console.log('Đang thực hiện mã hóa tự động các chuỗi đường dẫn API/Webhook...');
    function encryptString(str, key = 107) {
        const b64 = Buffer.from(str, 'utf-8').toString('base64');
        let xor = '';
        for (let i = 0; i < b64.length; i++) {
            xor += String.fromCharCode(b64.charCodeAt(i) ^ key);
        }
        return Buffer.from(xor, 'utf-8').toString('base64');
    }

    const decHelper = `
var _dec = function(b64) {
    var key = 107;
    var xor = atob(b64);
    var b64Dec = '';
    for (var i = 0; i < xor.length; i++) {
        b64Dec += String.fromCharCode(xor.charCodeAt(i) ^ key);
    }
    return decodeURIComponent(escape(atob(b64Dec)));
};
`;

    function obfuscateJS(jsCode) {
        let result = decHelper + '\n' + jsCode;
        const apiStringRegex = /(["'])((\/api\/|\/webhook\/)[^"']*?)\1/g;
        result = result.replace(apiStringRegex, (match, quote, content) => {
            const encrypted = encryptString(content);
            return `_dec("${encrypted}")`;
        });
        return result;
    }

    concatenatedJS = obfuscateJS(concatenatedJS);

    console.log('Đang tiến hành làm rối và nén JS chính (Terser + Tree Shaking)...');
    const terserResult = await minify(concatenatedJS, {
        compress: {
            drop_console: false,
            passes: 2,
            dead_code: true,
            unused: false,
            toplevel: false // Tắt toplevel để giữ biến toàn cục cho các inline/page script truy cập
        },
        mangle: {
            toplevel: false
        },
        format: {
            comments: false
        }
    });

    if (terserResult.error) {
        console.error('Lỗi nén code Terser:', terserResult.error);
        process.exit(1);
    }

    const jsBundleOutputPath = path.join(jsDistDir, 'app.bundle.min.js');
    fs.writeFileSync(jsBundleOutputPath, terserResult.code, 'utf-8');
    console.log(`✅ Đã đóng gói JS: ${jsBundleOutputPath} (${(terserResult.code.length / 1024).toFixed(2)} KB)`);

    // ─── 1.1 BIÊN DỊCH THEME.JS RIÊNG BIỆT ───
    console.log('\nĐang tiến hành tối ưu hóa theme.js...');
    const themeJsPath = path.join(__dirname, '../src/js/utils/theme.js');
    if (fs.existsSync(themeJsPath)) {
        const themeCode = fs.readFileSync(themeJsPath, 'utf-8');
        const terserThemeResult = await minify(themeCode, {
            compress: {
                drop_console: false,
                passes: 2,
                dead_code: true,
                unused: false,
                toplevel: false
            },
            mangle: {
                toplevel: false
            },
            format: {
                comments: false
            }
        });
        fs.writeFileSync(path.join(jsDistDir, 'theme.min.js'), terserThemeResult.code, 'utf-8');
        console.log(`✅ Đã đóng gói theme.js -> theme.min.js`);
    }

    // ─── 1.2 ĐÓNG GÓI CHO CÁC TRANG AUTH (LOGIN, REGISTER, FORGOT-PASSWORD) ───
    console.log('\nĐang tiến hành đóng gói JS cho các trang Auth...');
    const authScripts = [
        'env.js',
        'src/js/services/http.js',
        'src/js/services/auth.service.js',
        'src/js/services/notification-push.service.js',
        'src/js/components/Alert.js',
        'src/js/components/AuthThemeToggle.js',
        'src/js/components/PasswordToggle.js'
    ];

    let concatenatedAuthJS = '';
    for (const p of authScripts) {
        const absolutePath = path.join(__dirname, '..', p);
        if (fs.existsSync(absolutePath)) {
            concatenatedAuthJS += `\n/* --- BUNDLED JS: ${p} --- */\n`;
            concatenatedAuthJS += fs.readFileSync(absolutePath, 'utf-8') + '\n';
        } else {
            console.warn(`Cảnh báo: Không tìm thấy file ${absolutePath}`);
        }
    }

    concatenatedAuthJS = obfuscateJS(concatenatedAuthJS);

    console.log('Đang tiến hành làm rối và nén JS Auth...');
    const terserAuthResult = await minify(concatenatedAuthJS, {
        compress: {
            drop_console: false,
            passes: 2,
            dead_code: true,
            unused: false,
            toplevel: false
        },
        mangle: {
            toplevel: false
        },
        format: {
            comments: false
        }
    });

    if (terserAuthResult.error) {
        console.error('Lỗi nén code Terser cho Auth:', terserAuthResult.error);
        process.exit(1);
    }

    const authBundleOutputPath = path.join(jsDistDir, 'auth.bundle.min.js');
    fs.writeFileSync(authBundleOutputPath, terserAuthResult.code, 'utf-8');
    console.log(`✅ Đã đóng gói JS Auth: ${authBundleOutputPath} (${(terserAuthResult.code.length / 1024).toFixed(2)} KB)`);

    // ─── 1.3 ĐÓNG GÓI ĐỘNG MODULE CHATBOT V5 ───
    console.log('\nĐang tiến hành gom cụm động các module chatbot ES6...');
    const chatbotCoreFiles = [
        'chatbot-widget/js/utils/logger.js',
        'chatbot-widget/js/core/event-bus.js',
        'chatbot-widget/js/core/store.js',
        'chatbot-widget/js/core/network.js',
        'chatbot-widget/js/main.js'
    ];

    let bundledChatbotCore = bundleES6Modules(chatbotCoreFiles);
    bundledChatbotCore = obfuscateJS(bundledChatbotCore);

    console.log('Đang tiến hành nén và làm rối chatbot-core...');
    const terserChatbotCoreResult = await minify(bundledChatbotCore, {
        compress: {
            drop_console: false,
            passes: 2,
            dead_code: true,
            unused: false,
            toplevel: false
        },
        mangle: {
            toplevel: false
        },
        format: {
            comments: false
        }
    });

    if (terserChatbotCoreResult.error) {
        console.error('Lỗi nén chatbot-core:', terserChatbotCoreResult.error);
        process.exit(1);
    }

    const chatbotCoreBundlePath = path.join(__dirname, '../chatbot-widget/js/chatbot-core.bundle.min.js');
    fs.writeFileSync(chatbotCoreBundlePath, terserChatbotCoreResult.code, 'utf-8');
    console.log(`✅ Đã đóng gói thành công Chatbot Core Bundle: ${chatbotCoreBundlePath} (${(terserChatbotCoreResult.code.length / 1024).toFixed(2)} KB)`);

    // ─── 1.4 ĐÓNG GÓI CHATBOT WIDGET UI SCRIPTS ───
    console.log('\nĐang tiến hành đóng gói các UI script bổ trợ của Chatbot...');
    const chatbotUIScripts = [
        'src/js/utils/promotion.js',
        'chatbot-widget/js/chatbot-suggestions.js',
        'chatbot-widget/js/chatbot-order-draft.js',
        'chatbot-widget/js/chatbot-api-engine.js',
        'chatbot-widget/js/chatbot.js',
        'chatbot-widget/js/chatbot-renderers-medstand.js',
        'chatbot-widget/js/chatbot-renderer-create-customer.js',
        'chatbot-widget/js/chatbot-product-lookup-fix.js'
    ];

    let concatenatedChatbotUI = '';
    for (const p of chatbotUIScripts) {
        const absolutePath = path.join(__dirname, '..', p);
        if (fs.existsSync(absolutePath)) {
            concatenatedChatbotUI += `\n/* --- BUNDLED JS: ${p} --- */\n`;
            concatenatedChatbotUI += fs.readFileSync(absolutePath, 'utf-8') + '\n';
        } else {
            console.warn(`Cảnh báo: Không tìm thấy file ${absolutePath}`);
        }
    }

    concatenatedChatbotUI = obfuscateJS(concatenatedChatbotUI);

    console.log('Đang tiến hành làm rối và nén JS Chatbot UI...');
    const terserChatbotUIResult = await minify(concatenatedChatbotUI, {
        compress: {
            drop_console: false,
            passes: 2,
            dead_code: true,
            unused: false,
            toplevel: false
        },
        mangle: {
            toplevel: false
        },
        format: {
            comments: false
        }
    });

    if (terserChatbotUIResult.error) {
        console.error('Lỗi nén chatbot UI:', terserChatbotUIResult.error);
        process.exit(1);
    }

    const chatbotUIBundlePath = path.join(__dirname, '../chatbot-widget/js/chatbot.bundle.min.js');
    writeFileWithRetry(chatbotUIBundlePath, terserChatbotUIResult.code);
    console.log(`✅ Đã đóng gói và mã hóa Chatbot UI Bundle: ${chatbotUIBundlePath} (${(terserChatbotUIResult.code.length / 1024).toFixed(2)} KB)`);

    // ─── 1.5 ĐÓNG GÓI TỪNG PAGE SCRIPT RIÊNG LẺ ───
    console.log('\nĐang tiến hành nén & làm rối từng Page script...');
    const pagesSrcDir = path.join(__dirname, '../src/js/pages');
    const pageFiles = fs.readdirSync(pagesSrcDir);

    for (const file of pageFiles) {
        if (file.endsWith('.js')) {
            const pageFilePath = path.join(pagesSrcDir, file);
            let pageCode = fs.readFileSync(pageFilePath, 'utf-8');
            pageCode = obfuscateJS(pageCode);

            const terserPageResult = await minify(pageCode, {
                compress: {
                    drop_console: false,
                    passes: 2,
                    dead_code: true,
                    unused: false,
                    toplevel: false
                },
                mangle: {
                    toplevel: false
                },
                format: {
                    comments: false
                }
            });

            fs.writeFileSync(path.join(pagesJsDistDir, file), terserPageResult.code, 'utf-8');
        }
    }
    console.log(`✅ Đã tối ưu hóa và làm rối ${pageFiles.length} file Page JS.`);

    // ─── 2. ĐÓNG GÓI CSS HỆ THỐNG ───
    const cssRegex = /<link\s+[^>]*href=["']((?:src|chatbot-widget)\/css\/[^"']+)["'][^>]*rel=["']stylesheet["'][^>]*>|<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']((?:src|chatbot-widget)\/css\/[^"']+)["'][^>]*>/gi;
    const cssPaths = [];
    const cssTags = [];

    while ((match = cssRegex.exec(htmlContent)) !== null) {
        const fullTag = match[0];
        const cssPath = match[1] || match[2];
        cssPaths.push(cssPath);
        cssTags.push(fullTag);
    }

    console.log(`\nĐã phát hiện ${cssPaths.length} stylesheets nội bộ để đóng gói.`);

    let concatenatedCSS = '';
    for (const p of cssPaths) {
        const absolutePath = path.join(__dirname, '..', p);
        if (fs.existsSync(absolutePath)) {
            concatenatedCSS += `\n/* --- BUNDLED CSS: ${p} --- */\n`;
            concatenatedCSS += fs.readFileSync(absolutePath, 'utf-8') + '\n';
        } else {
            console.warn(`Cảnh báo: Không tìm thấy file ${absolutePath}`);
        }
    }

    console.log('Đang tiến hành nén tối ưu CSS chính...');
    const minifiedCSSCode = minifyCSS(concatenatedCSS);
    const cssBundleOutputPath = path.join(cssDistDir, 'app.bundle.min.css');
    fs.writeFileSync(cssBundleOutputPath, minifiedCSSCode, 'utf-8');
    console.log(`✅ Đã đóng gói CSS chính: ${cssBundleOutputPath} (${(minifiedCSSCode.length / 1024).toFixed(2)} KB)`);

    // ─── 2.2 NÉN CÁC FILE CSS DÙNG CHO LOAD ĐỘNG (PAGES/COMPONENTS/CHATBOT) ───
    console.log('\nĐang tiến hành nén các file CSS dùng cho load động...');
    
    // CSS Pages
    const cssPagesSrcDir = path.join(__dirname, '../src/css/pages');
    if (fs.existsSync(cssPagesSrcDir)) {
        const files = fs.readdirSync(cssPagesSrcDir);
        for (const file of files) {
            if (file.endsWith('.css')) {
                const raw = fs.readFileSync(path.join(cssPagesSrcDir, file), 'utf-8');
                fs.writeFileSync(path.join(cssPagesDistDir, file), minifyCSS(raw), 'utf-8');
            }
        }
    }

    // CSS Components
    const cssComponentsSrcDir = path.join(__dirname, '../src/css/components');
    if (fs.existsSync(cssComponentsSrcDir)) {
        const files = fs.readdirSync(cssComponentsSrcDir);
        for (const file of files) {
            if (file.endsWith('.css')) {
                const raw = fs.readFileSync(path.join(cssComponentsSrcDir, file), 'utf-8');
                fs.writeFileSync(path.join(cssComponentsDistDir, file), minifyCSS(raw), 'utf-8');
            }
        }
    }

    // CSS Chatbot
    const chatbotCssSrcDir = path.join(__dirname, '../chatbot-widget/css');
    if (fs.existsSync(chatbotCssSrcDir)) {
        const files = fs.readdirSync(chatbotCssSrcDir);
        for (const file of files) {
            if (file.endsWith('.css')) {
                const raw = fs.readFileSync(path.join(chatbotCssSrcDir, file), 'utf-8');
                fs.writeFileSync(path.join(chatbotCssDistDir, file), minifyCSS(raw), 'utf-8');
            }
        }
    }
    console.log('✅ Đã nén thành công toàn bộ file CSS động.');

    // ─── 3. TẠO TRANG INDEX PRODUCTION ĐÃ TỐI ƯU ───
    let prodHtmlContent = htmlContent.replace(/__APP_VERSION__/g, APP_VERSION);

    // Thay thế các thẻ CSS bằng 1 thẻ duy nhất
    cssTags.forEach((tag, index) => {
        if (index === 0) {
            prodHtmlContent = prodHtmlContent.replace(tag, `<link rel="stylesheet" href="src/css/dist/app.bundle.min.css?v=${APP_VERSION}">`);
        } else {
            prodHtmlContent = prodHtmlContent.replace(tag, '');
        }
    });

    // Thay thế các thẻ JS hệ thống bằng 1 thẻ duy nhất
    scriptTags.forEach((tag, index) => {
        if (index === 0) {
            prodHtmlContent = prodHtmlContent.replace(tag, `<script src="src/js/dist/app.bundle.min.js?v=${APP_VERSION}"></script>`);
        } else {
            prodHtmlContent = prodHtmlContent.replace(tag, '');
        }
    });

    // Thay thế script theme.js
    prodHtmlContent = prodHtmlContent.replace(
        /<script\s+src=["']src\/js\/utils\/theme\.js["']><\/script>/gi,
                `<script src="src/js/dist/theme.min.js?v=${APP_VERSION}"></script>`
    );

    // Thay thế script chatbot module bằng bundle chatbot-core
    prodHtmlContent = prodHtmlContent.replace(
        /<script\s+type=["']module["']\s+src=["']chatbot-widget\/js\/main\.js["']><\/script>/gi,
                `<script src="chatbot-widget/js/chatbot-core.bundle.min.js?v=${APP_VERSION}"></script>`
    );

    // Hai helper đã được tích hợp vào bundle hoặc engine; không tải source thô
    // vì server chủ động chặn mọi file JS chưa minify trong chatbot-widget/js.
    prodHtmlContent = prodHtmlContent.replace(
        /\s*<script\s+src=["']chatbot-widget\/js\/(?:chatbot-order-panel-collapse|chatbot-product-lookup-fix)\.js\?v=\d+["']><\/script>/gi,
        ''
    );

    // Loại bỏ thẻ env.js khỏi file production HTML vì đã gộp vào bundle
    prodHtmlContent = prodHtmlContent.replace(/<script\s+src=["']env\.js["']><\/script>/gi, '');

    // Đồng bộ phiên bản Service Worker để trình duyệt tự xóa cache của bản cũ.
    const serviceWorkerPath = path.join(__dirname, '../sw.js');
    if (fs.existsSync(serviceWorkerPath)) {
        const serviceWorkerContent = fs.readFileSync(serviceWorkerPath, 'utf-8')
            .replace(/const CACHE_VERSION = ['"]medstand-[^'"]+['"];/,
                `const CACHE_VERSION = 'medstand-${APP_VERSION}';`);
        writeFileWithRetry(serviceWorkerPath, serviceWorkerContent);
    }

    // Loại bỏ các dòng trống thừa
    prodHtmlContent = prodHtmlContent.replace(/\r?\n\s*\r?\n/g, '\n');

    // ─── 4. CẬP NHẬT CÁC FILE TRANG AUTH HTML ───
    console.log('\nĐang tiến hành tối ưu hóa đường dẫn cho các trang Auth HTML...');
    const authHtmlFiles = [
        '../pages/login.html',
        '../pages/register.html',
        '../pages/forgot-password.html'
    ];

    for (const fileRelPath of authHtmlFiles) {
        const filePath = path.join(__dirname, fileRelPath);
        if (fs.existsSync(filePath)) {
            let content = fs.readFileSync(filePath, 'utf-8');
            
            // Thay thế script theme.js bằng bản minified trong dist.
            // Khớp cả đường dẫn gốc lẫn đường dẫn đã build ở lần chạy trước, nếu không
            // thì sau lần build đầu tiên regex sẽ không còn khớp và ?v= bị đóng băng vĩnh viễn.
            content = content.replace(
                /src=["'](?:\.\.\/)?src\/js\/(?:utils\/theme\.js|dist\/theme\.min\.js)(?:\?v=[\d.]+)?["']/gi,
                `src="../src/js/dist/theme.min.js?v=${APP_VERSION}"`
            );

            // Cache-bust auth bundle as well. Without a version, the service worker can keep
            // an old SPA fallback response for this URL after an interrupted build.
            content = content.replace(
                /src=["'](?:\.\.\/)?src\/js\/dist\/auth\.bundle\.min\.js(?:\?v=[\d.]+)?["']/gi,
                `src="../src/js/dist/auth.bundle.min.js?v=${APP_VERSION}"`
            );
            
            fs.writeFileSync(filePath, content, 'utf-8');
            console.log(`✅ Đã cập nhật xong: ${fileRelPath}`);
        }
    }

    const prodHtmlPath = path.join(__dirname, '../index.prod.html');
    const indexHtmlPath = path.join(__dirname, '../index.html');
    fs.writeFileSync(prodHtmlPath, prodHtmlContent, 'utf-8');
    fs.writeFileSync(indexHtmlPath, prodHtmlContent, 'utf-8');
    console.log(`\n✅ Đã tạo file HTML Production thành công: ${indexHtmlPath} và ${prodHtmlPath}`);
    console.log('===================================================');
}

build();
