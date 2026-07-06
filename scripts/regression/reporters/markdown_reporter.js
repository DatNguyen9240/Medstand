/**
 * Trình xuất báo cáo định dạng Markdown (Markdown Reporter)
 */
const fs = require('fs');
const path = require('path');

module.exports = {
    generate(results, summary, config) {
        const outputDir = config.PATHS.REPORTS_DIR;
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const dateStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        
        let md = `# 🏥 BÁO CÁO KẾT QUẢ KIỂM THỬ HỒI QUY MEDSTAND AI\n\n`;
        md += `**Thời gian chạy:** ${dateStr} (Giờ Việt Nam)\n\n`;
        
        md += `## 📊 Tóm tắt kết quả kiểm thử (Summary)\n\n`;
        md += `| Chỉ số | Giá trị | Tỷ lệ |\n`;
        md += `|---|---|---|\n`;
        md += `| **Tổng số kịch bản (Total)** | ${summary.total} | 100% |\n`;
        md += `| **Đạt yêu cầu (PASSED)** | **${summary.passed}** | ${((summary.passed / summary.total) * 100).toFixed(1)}% |\n`;
        md += `| **Thất bại (FAILED)** | **${summary.failed}** | ${((summary.failed / summary.total) * 100).toFixed(1)}% |\n`;
        md += `| **Cảnh báo (WARNING)** | **${summary.warning}** | ${((summary.warning / summary.total) * 100).toFixed(1)}% |\n`;
        md += `| **Bỏ qua (SKIPPED)** | **${summary.skipped}** | ${((summary.skipped / summary.total) * 100).toFixed(1)}% |\n`;
        md += `| **Tỷ lệ vượt qua (Pass Rate)** | **${summary.passRate}%** | - |\n\n`;

        md += `## 📋 Chi tiết kết quả từng Test Case\n\n`;
        md += `| STT | Phân hệ (Suite) | Tên kịch bản (Test Case) | Trạng thái | Thời gian chạy | Kết quả chi tiết / Lý do lỗi |\n`;
        md += `|---|---|---|---|---|---|\n`;

        for (const r of results) {
            let statusBadge = '';
            if (r.status === 'PASSED') {
                statusBadge = '🟢 **PASSED**';
            } else if (r.status === 'FAILED') {
                statusBadge = '🔴 **FAILED**';
            } else if (r.status === 'WARNING') {
                statusBadge = '🟡 **WARNING**';
            } else if (r.status === 'SKIPPED') {
                statusBadge = '⚪ **SKIPPED**';
            }

            const elapsedStr = r.elapsedMs ? `${r.elapsedMs}ms` : '-';
            let detailStr = '';
            if (r.status === 'FAILED') {
                detailStr = `Lỗi: \`${r.error}\``;
            } else if (r.status === 'SKIPPED') {
                detailStr = `Bỏ qua: \`${r.error}\``;
            } else if (r.status === 'WARNING') {
                detailStr = `Cảnh báo: ${r.error || 'AI phản hồi không chuẩn mẫu'}`;
            } else {
                detailStr = r.responseSnippet ? `Phản hồi: _"${r.responseSnippet}"_` : 'Thành công.';
            }

            // Dọn dẹp dòng xuống dòng tránh làm vỡ bảng Markdown
            const cleanDetail = detailStr.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');

            md += `| ${r.id} | \`${r.suite}\` | ${r.name} | ${statusBadge} | ${elapsedStr} | ${cleanDetail} |\n`;
        }

        md += `\n---\n`;
        md += `_Báo cáo này được tạo tự động bởi Medstand Mini Test Framework._\n`;

        const targetFile = path.join(outputDir, 'regression-result.md');
        fs.writeFileSync(targetFile, md, 'utf8');
        return targetFile;
    }
};
