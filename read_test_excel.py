#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script đọc file Excel test lỗi AI và in ra console
"""
import sys
import json

try:
    import pandas as pd
except ImportError:
    print("Installing pandas and openpyxl...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pandas", "openpyxl", "-q"])
    import pandas as pd

# Đọc file Excel
excel_file = "TestLoiAI MedstandV2.xlsx"
try:
    # Đọc tất cả sheets
    xls = pd.ExcelFile(excel_file)
    print(f"=== Danh sách sheets: {xls.sheet_names}")
    print()
    
    # Đọc sheet đầu tiên (hoặc tất cả)
    for sheet_name in xls.sheet_names[:3]:  # Chỉ đọc 3 sheet đầu để tránh quá dài
        print(f"\n{'='*80}")
        print(f"SHEET: {sheet_name}")
        print('='*80)
        
        df = pd.read_excel(excel_file, sheet_name=sheet_name)
        
        # In thông tin cơ bản
        print(f"Số dòng: {len(df)}")
        print(f"Các cột: {list(df.columns)}")
        print()
        
        # In 20 dòng đầu tiên
        print("=== Dữ liệu (20 dòng đầu):")
        print(df.head(20).to_string(index=False))
        print()
        
except FileNotFoundError:
    print(f"Không tìm thấy file: {excel_file}")
    print("Vui lòng đảm bảo file nằm cùng thư mục với script này.")
except Exception as e:
    print(f"Lỗi khi đọc file: {e}")
    import traceback
    traceback.print_exc()
