const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

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

    // Regex tìm các thẻ <script src="src/js/..."></script>
    // Có thể bao gồm cả v=...
    const scriptRegex = /<script\s+[^>]*src=["'](src\/js\/[^"']+)["'][^>]*><\/script>/gi;
    let match;
    const scriptPaths = [];
    const scriptTags = [];

    while ((match = scriptRegex.exec(htmlContent)) !== null) {
        const fullTag = match[0];
        const scriptPathWithQuery = match[1];
        // Bỏ phần query string (?v=...) để đọc file thật
        const realPath = scriptPathWithQuery.split('?')[0];
        scriptPaths.push(realPath);
        scriptTags.push(fullTag);
    }

    if (scriptPaths.length === 0) {
        console.log('Không tìm thấy script nội bộ nào để đóng gói.');
        return;
    }

    console.log(`Đã phát hiện ${scriptPaths.length} scripts nội bộ để đóng gói:`);
    scriptPaths.forEach(p => console.log(` - ${p}`));

    // Đọc nội dung và ghép nối
    let concatenatedCode = '';
    for (const p of scriptPaths) {
        const absolutePath = path.join(__dirname, '..', p);
        if (fs.existsSync(absolutePath)) {
            concatenatedCode += `\n/* --- BUNDLED FILE: ${p} --- */\n`;
            concatenatedCode += fs.readFileSync(absolutePath, 'utf-8') + '\n';
        } else {
            console.warn(`Cảnh báo: Không tìm thấy file ${absolutePath}`);
        }
    }

    console.log('\nĐang tiến hành làm rối và nén mã nguồn (Minifying & Obfuscating)...');
    
    try {
        const terserResult = await minify(concatenatedCode, {
            compress: {
                drop_console: false, // Giữ console.log để chẩn đoán hệ thống
                passes: 2
            },
            mangle: true, // Đổi tên biến và hàm để làm rối
            format: {
                comments: false // Xóa sạch comment
            }
        });

        if (terserResult.error) {
            console.error('Lỗi nén code Terser:', terserResult.error);
            process.exit(1);
        }

        const outputDir = path.join(__dirname, '../src/js/dist');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const bundleOutputPath = path.join(outputDir, 'app.bundle.min.js');
        fs.writeFileSync(bundleOutputPath, terserResult.code, 'utf-8');
        console.log(`\n✅ Đã đóng gói thành công: ${bundleOutputPath} (${(terserResult.code.length / 1024).toFixed(2)} KB)`);

        // Tạo file index.prod.html cho production
        // Thay thế toàn bộ các thẻ script gốc bằng thẻ script bundle duy nhất
        const firstTag = scriptTags[0];
        let prodHtmlContent = htmlContent;

        // Xóa tất cả các thẻ script nội bộ ngoại trừ thẻ đầu tiên
        scriptTags.forEach((tag, index) => {
            if (index === 0) {
                // Thay thế thẻ đầu tiên bằng thẻ dẫn đến bundle
                prodHtmlContent = prodHtmlContent.replace(tag, '<script src="src/js/dist/app.bundle.min.js"></script>');
            } else {
                // Xóa các thẻ sau
                prodHtmlContent = prodHtmlContent.replace(tag, '');
            }
        });

        // Làm sạch các dòng trống thừa thãi do việc xóa thẻ script
        prodHtmlContent = prodHtmlContent.replace(/\r?\n\s*\r?\n/g, '\n');

        const prodHtmlPath = path.join(__dirname, '../index.prod.html');
        fs.writeFileSync(prodHtmlPath, prodHtmlContent, 'utf-8');
        console.log(`✅ Đã tạo file HTML Production thành công: ${prodHtmlPath}`);
        console.log('===================================================');
    } catch (err) {
        console.error('Lỗi trong quá trình build:', err);
        process.exit(1);
    }
}

build();
