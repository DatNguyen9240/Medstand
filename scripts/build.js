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

    const htmlPath = path.join(__dirname, '../index.html');
    if (!fs.existsSync(htmlPath)) {
        console.error('Lỗi: Không tìm thấy file index.html!');
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
    fs.writeFileSync(prodHtmlPath, prodHtmlContent, 'utf-8');
    console.log(`\n✅ Đã tạo file HTML Production thành công: ${prodHtmlPath}`);
    console.log('===================================================');
}

build();
