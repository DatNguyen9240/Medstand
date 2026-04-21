import json

with open('n8n/K_SieuLuong_V2.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

for node in data['nodes']:
    if node['name'] == 'Extract Intent Chain':
        prompt = node['parameters']['messages']['messageValues'][0]['message']
        
        # Remove old patches if exists
        prompt = prompt.replace('[TODAY]. M?i th?i gian nhu \"nam nay\", \"hôm qua\" ph?i quy ra [THIS_YEAR_START], [YESTERDAY].', '[TODAY].')
        
        if 'Quy Ð?i Th?i Gian' not in prompt:
            date_rule = "\n\n4.5 Quy Ð?i Th?i Gian (T? d?ng tính ngày)\nB?T C? KHI NÀO user nh?c d?n m?c ho?c kho?ng th?i gian (nam nay, tháng tru?c, nam ngoái, tháng m?y...), b?n PH?I T? Ð?NG TÍNH TOÁN sang chu?n YYYY-MM-DD d? gán cho @TuNgay và @DenNgay d?a vào ngày hôm nay.\nVD \"nam nay\" -> @TuNgay = ngày d?u nam, @DenNgay = [TODAY]\nVD \"tháng tru?c\" -> t? mùng 1 d?n cu?i tháng tru?c.\nVD \"15/4 nam 2025\" -> @TuNgay=2025-04-15, @DenNgay=2025-04-15\n"
            
            # Find the position of '4.' to insert before it
            idx = prompt.find('4. D')
            if idx != -1:
                prompt = prompt[:idx] + date_rule + prompt[idx:]
            else:
                prompt += date_rule
            
            node['parameters']['messages']['messageValues'][0]['message'] = prompt
            
with open('n8n/K_SieuLuong_V2.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print('Done applying!')
