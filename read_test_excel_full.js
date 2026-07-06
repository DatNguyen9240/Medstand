#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
let XLSX;
try { XLSX = require('xlsx'); } catch (e) { console.error('Please install xlsx first: npm install xlsx'); process.exit(1); }
const excelFile = path.join(__dirname, 'TestLoiAI MedstandV2.xlsx');
if (!fs.existsSync(excelFile)) { console.error('Missing file:', excelFile); process.exit(1); }
const workbook = XLSX.readFile(excelFile);
for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  console.log('='.repeat(80));
  console.log(`SHEET: ${sheetName} (${rows.length} rows)`);
  console.log('='.repeat(80));
  rows.forEach((row, idx) => {
    console.log(`Row ${idx + 1}: ${JSON.stringify(row, null, 2)}`);
  });
}
