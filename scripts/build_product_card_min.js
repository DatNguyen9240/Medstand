'use strict';

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'chatbot-widget', 'js', 'chatbot-product-card.js');
const targetPath = path.join(root, 'chatbot-widget', 'js', 'chatbot-product-card.min.js');

async function main() {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const result = await minify(source, {
    compress: { passes: 2, dead_code: true },
    mangle: true,
    format: { comments: false },
  });
  if (!result.code) throw new Error('Terser không tạo được product card bundle.');
  fs.writeFileSync(targetPath, result.code, 'utf8');
  console.log(`Product card bundle: ${(result.code.length / 1024).toFixed(2)} KB`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
