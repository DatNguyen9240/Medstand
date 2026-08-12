'use strict';

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'src', 'js', 'pages', 'rag-admin.js');
const outputPath = path.join(root, 'src', 'js', 'dist', 'pages', 'rag-admin.js');
const cssSourcePath = path.join(root, 'src', 'css', 'pages', 'rag-admin.css');
const cssOutputPath = path.join(root, 'src', 'css', 'dist', 'pages', 'rag-admin.css');

function minifyCss(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>])\s*/g, '$1')
    .trim();
}

async function main() {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const result = await minify(source, { compress: { passes: 2 }, mangle: true, format: { comments: false } });
  if (!result.code) throw new Error('Terser không tạo được output RAG admin.');
  fs.writeFileSync(outputPath, result.code, 'utf8');
  const css = minifyCss(fs.readFileSync(cssSourcePath, 'utf8'));
  fs.writeFileSync(cssOutputPath, css, 'utf8');
  console.log(JSON.stringify({ task: 'RAG-ADMIN-ISOLATED-CSS', status: 'BUILT', bytes: Buffer.byteLength(css) }, null, 2));
  console.log(JSON.stringify({ task: 'RAG-001-RAG-ADMIN-MIN', status: 'BUILT', bytes: Buffer.byteLength(result.code) }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ task: 'RAG-001-RAG-ADMIN-MIN', status: 'ERROR', error: error.message }, null, 2));
  process.exitCode = 1;
});
