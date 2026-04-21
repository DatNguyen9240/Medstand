import json
import re

with open('n8n/K_SieuLuong_V2.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for node in data['nodes']:
    if node['name'] == 'Extract Intent Chain':
        prompt = node['parameters']['messages']['messageValues'][0]['message']
        
        # 1. Clean up line 74: unbalanced parentheses
        prompt = prompt.replace(
            '- @doanh_so: doanh s\u1ed1 ((TUYET DOI PHAI',
            '- @doanh_so: doanh so (TUYET DOI PHAI'
        )
        
        # 2. Fix FAIL CASE 1
        fail_case_1_old = 'Input: User: dt th3 nhieu | History: []\nOutput:\n{\n  "intent": "@doanh_so",\n  "params": {},\n  "status": "SUCCESS",\n  "missing_fields": []\n}'
        fail_case_1_new = 'Input: User: tong doanh thu cua nha thuoc la bn | History: []\nOutput:\n{\n  "intent": "@doanh_so",\n  "params": {},\n  "status": "SUCCESS",\n  "missing_fields": []\n}'
        
        prompt = prompt.replace(fail_case_1_old, fail_case_1_new)
        
        # 3. Add a explicit FEW SHOT for time extraction to reinforce learning!
        new_few_shot = '\n\u274c FAIL CASE 6 \u2192 DATE EXTRACTION\nInput: User: top nhan vien ban nhieu nhat nam nay | History: []\nOutput:\n{\n  "intent": "@doanh_so",\n  "params": { "@TuNgay": "[THIS_YEAR_START]", "@DenNgay": "[TODAY]", "@LoaiBaoCao": "NhanVien" },\n  "status": "SUCCESS",\n  "missing_fields": []\n}\n'
        
        # Insert before "\n\u274c FAIL CASE 1" string
        idx = prompt.find('\n\u274c FAIL CASE 1')
        if idx != -1:
            prompt = prompt[:idx] + new_few_shot + prompt[idx:]
        
        node['parameters']['messages']['messageValues'][0]['message'] = prompt

with open('n8n/K_SieuLuong_V2.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print('V4 applied!')
