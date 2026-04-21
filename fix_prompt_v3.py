import json

with open('n8n/K_SieuLuong_V2.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for node in data['nodes']:
    if node['name'] == 'Extract Intent Chain':
        prompt = node['parameters']['messages']['messageValues'][0]['message']
        
        # 1. Update the Quy Doi Thoi Gian to use strict tags
        idx = prompt.find('4.5 Quy Doi Thoi Gian')
        if idx != -1:
            end_idx = prompt.find('5. Danh sach Intent') if '5. Danh sach Intent' in prompt else prompt.find('6. Uu tien')
            if end_idx == -1: end_idx = len(prompt)
            prompt = prompt[:idx] + prompt[end_idx:] # Remove the old section
            
        rule = '\n\n4.5 Quy Doi Thoi Gian (Tu dong tinh ngay)\nBAT CU KHI NAO user nhac den moc hoac khoang thoi gian (nam nay, thang truoc, nam ngoai, thang may...),\nban PHAI TU DONG thay the sang cac MA so sau de gan cho @TuNgay va @DenNgay.\n- "hom nay" -> [TODAY]\n- "hom qua" -> [YESTERDAY]\n- "thang nay" -> @TuNgay=[THIS_MONTH_START], @DenNgay=[TODAY]\n- "nam nay" -> @TuNgay=[THIS_YEAR_START], @DenNgay=[TODAY]\nNgoai cac mien tren, ban tu phan tich ra YYYY-MM-DD. Kiem tra that ky nam nay la nam nao.\n\n'
        
        # 2. Update Doanh So param requirement
        prompt = prompt.replace(
            '- @doanh_so: doanh s\u1ed1 (params: kh\u00f4ng \u00e9p bu\u1ed9c).',
            '- @doanh_so: doanh s\u1ed1 (TUYET DOI PHAI trich xuat @TuNgay, @DenNgay neu co nhac thoi gian).' # Avoid unicode issues
        )
        prompt = prompt.replace(
            '- @doanh_so: doanh s\u1ed1 (params: kh\u00f4ng \u00e9p bu\u1ed9c,',
            '- @doanh_so: doanh s\u1ed1 (TUYET DOI PHAI trich xuat @TuNgay, @DenNgay neu co nhac thoi gian, '
        )
        # Ensure we insert rule before "5. " or similar location.
        insert_idx = prompt.find('6. ')
        if insert_idx != -1:
            prompt = prompt[:insert_idx] + rule + prompt[insert_idx:]
        else:
            prompt += rule
            
        node['parameters']['messages']['messageValues'][0]['message'] = prompt
                
with open('n8n/K_SieuLuong_V2.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=True, indent=2)

print('Finished replacing the prompt!')
