/**
 * Trình xuất báo cáo định dạng JSON (JSON Reporter)
 */
const fs = require('fs');
const path = require('path');

module.exports = {
    generate(results, summary, config) {
        const outputDir = config.PATHS.REPORTS_DIR;
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const reportData = {
            generatedAt: new Date().toISOString(),
            summary: {
                total: summary.total,
                passed: summary.passed,
                failed: summary.failed,
                skipped: summary.skipped,
                warning: summary.warning,
                passRate: summary.passRate
            },
            results: results.map(r => ({
                id: r.id,
                suite: r.suite,
                name: r.name,
                status: r.status,
                elapsedMs: r.elapsedMs,
                error: r.error || null,
                responseSnippet: r.responseSnippet || null
            }))
        };

        const targetFile = path.join(outputDir, 'regression-result.json');
        fs.writeFileSync(targetFile, JSON.stringify(reportData, null, 2), 'utf8');
        return targetFile;
    }
};
