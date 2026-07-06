#!/usr/bin/env node
/**
 * Script đọc file Excel test lỗi AI
 */
const fs = require('fs');
const path = require('path');

// Kiểm tra xlsx có chưa
let XLSX;
try {
  XLSX = require('xlsx');
} catch (e) {
  console.log('Cần cài đặt thư viện xlsx...');
  console.log('Chạy: npm install xlsx');
  process.exit(1);
}

const excelFile = path.join(__dirname, 'TestLoiAI MedstandV2.xlsx');

if (!fs.existsSync(excelFile)) {
  console.error('Không tìm thấy file:', excelFile);
  process.exit(1);
}

console.log('Đang đọc file Excel...\n');

try {
  const workbook = XLSX.readFile(excelFile);
  
  console.log('=== Danh sách sheets:', workbook.SheetNames.join(', '));
  console.log();
  
  // Đọc 2 sheet đầu tiên
  for (let i = 0; i < Math.min(2, workbook.SheetNames.length); i++) {
    const sheetName = workbook.SheetNames[i];
    const sheet = workbook.Sheets[sheetName];
    
    console.log('='.repeat(80));
    console.log(`SHEET: ${sheetName}`);
    console.log('='.repeat(80));
    
    // Chuyển sheet thành JSON
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    
    if (data.length === 0) {
      console.log('(Sheet trống)');
      continue;
    }
    
    const headers = data[0];
    console.log(`Số dòng: ${data.length - 1}`);
    console.log(`Các cột: ${headers.join(' | ')}`);
    console.log();
    
    // In 25 dòng đầu (header + 24 rows)
    const maxRows = Math.min(25, data.length);
    console.log('=== Dữ liệu:');
    
    for (let r = 0; r < maxRows; r++) {
      const row = data[r];
      const rowStr = row.map((cell, idx) => {
        const val = String(cell || '').substring(0, 50); // Giới hạn 50 ký tự
        return val;
      }).join(' | ');
      console.log(`${r === 0 ? 'HEADER' : `Row ${r}`}: ${rowStr}`);
    }
    
    console.log();
  }
  
  console.log('\n✅ Đọc file thành công!');
  
} catch (error) {
  console.error('❌ Lỗi khi đọc file:', error.message);
  console.error(error.stack);
}
