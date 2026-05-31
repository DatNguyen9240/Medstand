const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

// Bộ nén CSS bằng regex siêu nhẹ, không phụ thuộc package ngoài
function minifyCSS(cssContent) {
    return cssContent
        .replace(/\/\*[\s\S]*?\*\//g, '')    // Xóa comment
        .replace(/\s+/g, ' ')                // Gộp khoảng trắng
        .replace(/\s*([\{\}:;,])\s*/g, '$1') // Xóa khoảng trắng thừa quanh cấu trúc CSS
        .replace(/;}/g, '}')                 // Xóa dấu chấm phẩy thừa cuối block
        .trim();
}

async function build() {
    console.log('===================================================');
    console.log('🚀 MEDSTAND FRONTEND BUNDLER & MINIFIER');
    console.log('===================================================');

    const htmlPath = path.join(__dirname, '../index.dev.html');
    if (!fs.existsSync(htmlPath)) {
        console.error('Lỗi: Không tìm thấy file index.dev.html!');
        process.exit(1);
    }

    let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

    // ─── 1. ĐÓNG GÓI JAVASCRIPT ───
    const scriptRegex = /<script\s+[^>]*src=["'](src\/js\/[^"']+)["'][^>]*><\/script>/gi;
    let match;
    const scriptPaths = [];
    const scriptTags = [];

    while ((match = scriptRegex.exec(htmlContent)) !== null) {
        const fullTag = match[0];
        const scriptPathWithQuery = match[1];
        const realPath = scriptPathWithQuery.split('?')[0];
        
        // Bỏ qua theme.js để nó chạy độc lập trong head tránh lỗi giật màn hình và thiếu Cash.js ($)
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
            concatenatedJS += `\n/* --- BUNDLED JS: ${p} --- */\n`;
            concatenatedJS += fs.readFileSync(absolutePath, 'utf-8') + '\n';
        } else {
            console.warn(`Cảnh báo: Không tìm thấy file ${absolutePath}`);
        }
    }

    // --- 1B. AUTO STRING OBFUSCATION (MÃ HÓA ẢN GIẤU 100% API/WEBHOOK PATHS) ---
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

    console.log('Đang tiến hành làm rối và nén JS...');
    const terserResult = await minify(concatenatedJS, {
        compress: {
            drop_console: false,
            passes: 2
        },
        mangle: true,
        format: {
            comments: false
        }
    });

    if (terserResult.error) {
        console.error('Lỗi nén code Terser:', terserResult.error);
        process.exit(1);
    }

    const jsOutputDir = path.join(__dirname, '../src/js/dist');
    if (!fs.existsSync(jsOutputDir)) fs.mkdirSync(jsOutputDir, { recursive: true });
    const jsBundleOutputPath = path.join(jsOutputDir, 'app.bundle.min.js');
    fs.writeFileSync(jsBundleOutputPath, terserResult.code, 'utf-8');
    console.log(`✅ Đã đóng gói JS: ${jsBundleOutputPath} (${(terserResult.code.length / 1024).toFixed(2)} KB)`);

    // ─── 1.2 ĐÓNG GÓI CHO CÁC TRANG AUTH (LOGIN, REGISTER, FORGOT-PASSWORD) ───
    console.log('\nĐang tiến hành đóng gói JS cho các trang Auth...');
    const authScripts = [
        'env.js',
        'src/js/services/http.js',
        'src/js/services/auth.service.js',
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
            passes: 2
        },
        mangle: true,
        format: {
            comments: false
        }
    });

    if (terserAuthResult.error) {
        console.error('Lỗi nén code Terser cho Auth:', terserAuthResult.error);
        process.exit(1);
    }

    const authBundleOutputPath = path.join(jsOutputDir, 'auth.bundle.min.js');
    fs.writeFileSync(authBundleOutputPath, terserAuthResult.code, 'utf-8');
    console.log(`✅ Đã đóng gói JS Auth: ${authBundleOutputPath} (${(terserAuthResult.code.length / 1024).toFixed(2)} KB)`);

    // ─── 1.3 ĐÓNG GÓI RIÊNG CHO PLUGIN CHATBOT WIDGET (TÁCH BIỆT DỄ MANG SANG WEB KHÁC) ───
    console.log('\nĐang tiến hành đóng gói và bảo mật riêng cho module Chatbot Widget...');
    const chatbotScripts = [
        'chatbot-widget/js/chatbot-suggestions.js',
        'chatbot-widget/js/chatbot-api-engine.js',
        'chatbot-widget/js/chatbot.js',
        'chatbot-widget/js/chatbot-renderers-medstand.js'
    ];

    let concatenatedChatbotJS = '';
    for (const p of chatbotScripts) {
        const absolutePath = path.join(__dirname, '..', p);
        if (fs.existsSync(absolutePath)) {
            concatenatedChatbotJS += `\n/* --- BUNDLED JS: ${p} --- */\n`;
            concatenatedChatbotJS += fs.readFileSync(absolutePath, 'utf-8') + '\n';
        } else {
            console.warn(`Cảnh báo: Không tìm thấy file ${absolutePath}`);
        }
    }

    concatenatedChatbotJS = obfuscateJS(concatenatedChatbotJS);

    console.log('Đang tiến hành làm rối và nén JS Chatbot...');
    const terserChatbotResult = await minify(concatenatedChatbotJS, {
        compress: {
            drop_console: false,
            passes: 2
        },
        mangle: true,
        format: {
            comments: false
        }
    });

    if (terserChatbotResult.error) {
        console.error('Lỗi nén code Terser cho Chatbot:', terserChatbotResult.error);
        process.exit(1);
    }

    const chatbotBundleOutputPath = path.join(__dirname, '../chatbot-widget/js/chatbot.bundle.min.js');
    fs.writeFileSync(chatbotBundleOutputPath, terserChatbotResult.code, 'utf-8');
    console.log(`✅ Đã đóng gói và mã hóa thành công Chatbot Bundle: ${chatbotBundleOutputPath} (${(terserChatbotResult.code.length / 1024).toFixed(2)} KB)`);

    // ─── 2. ĐÓNG GÓI CSS ───
    // Tìm các thẻ link stylesheet cục bộ (src/css/... hoặc chatbot-widget/css/...)
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

    console.log('Đang tiến hành làm nén tối ưu CSS...');
    const minifiedCSSCode = minifyCSS(concatenatedCSS);
    const cssOutputDir = path.join(__dirname, '../src/css/dist');
    if (!fs.existsSync(cssOutputDir)) fs.mkdirSync(cssOutputDir, { recursive: true });
    const cssBundleOutputPath = path.join(cssOutputDir, 'app.bundle.min.css');
    fs.writeFileSync(cssBundleOutputPath, minifiedCSSCode, 'utf-8');
    console.log(`✅ Đã đóng gói CSS: ${cssBundleOutputPath} (${(minifiedCSSCode.length / 1024).toFixed(2)} KB)`);

    // ─── 3. TẠO TRANG INDEX PRODUCTION ĐÃ TỐI ƯU ───
    let prodHtmlContent = htmlContent;

    // Thay thế các thẻ CSS bằng 1 thẻ duy nhất
    cssTags.forEach((tag, index) => {
        if (index === 0) {
            prodHtmlContent = prodHtmlContent.replace(tag, '<link rel="stylesheet" href="src/css/dist/app.bundle.min.css">');
        } else {
            prodHtmlContent = prodHtmlContent.replace(tag, '');
        }
    });

    // Thay thế các thẻ JS bằng 1 thẻ duy nhất
    scriptTags.forEach((tag, index) => {
        if (index === 0) {
            prodHtmlContent = prodHtmlContent.replace(tag, '<script src="src/js/dist/app.bundle.min.js"></script>');
        } else {
            prodHtmlContent = prodHtmlContent.replace(tag, '');
        }
    });

    // Loại bỏ thẻ env.js khỏi file production HTML vì đã gộp vào bundle
    prodHtmlContent = prodHtmlContent.replace(/<script\s+src=["']env\.js["']><\/script>/gi, '');

    // Loại bỏ các dòng trống thừa
    prodHtmlContent = prodHtmlContent.replace(/\r?\n\s*\r?\n/g, '\n');

    const prodHtmlPath = path.join(__dirname, '../index.prod.html');
    const indexHtmlPath = path.join(__dirname, '../index.html');
    fs.writeFileSync(prodHtmlPath, prodHtmlContent, 'utf-8');
    fs.writeFileSync(indexHtmlPath, prodHtmlContent, 'utf-8');
    console.log(`\n✅ Đã tạo file HTML Production thành công: ${indexHtmlPath} và ${prodHtmlPath}`);
    console.log('===================================================');
}

build();
