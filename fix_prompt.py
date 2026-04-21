import json

with open('n8n/K_SieuLuong_V2.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for node in data['nodes']:
    if node['name'] == 'Extract Intent Chain':
        prompt = node['parameters']['messages']['messageValues'][0]['message']
        if 'Quy Doi' not in prompt:
            rule1 = '\n\n4.5 Quy Doi Thoi Gian (Tu dong tinh ngay theo UTC)\n'
            rule2 = 'BAT CU KHI NAO user nhac den moc hoac khoang thoi gian (nam nay, thang truoc, nam ngoai, thang may...),\n'
            rule3 = 'ban PHAI TU DONG TINH TOAN sang ranh gioi ngay chuan YYYY-MM-DD de gan cho @TuNgay va @DenNgay.\n'
            rule4 = 'Vi du hom nay la TODAY:\n'
            rule5 = '- "nam nay" -> @TuNgay = ngay dau nam, @DenNgay = [TODAY]\n'
            rule6 = '- "thang truoc" -> tu mung 1 den ngay cuoi cung cua thang truoc.\n'
            rule7 = '- "hom qua" -> @TuNgay = ngay hom qua, @DenNgay = ngay hom qua.\n'
            rule8 = '- "quy truoc" -> tu ngay dau quy Den ngay cuoi quy truoc.\n'
            
            date_rule = rule1 + rule2 + rule3 + rule4 + rule5 + rule6 + rule7 + rule8
            
            idx = prompt.find('4. ')
            if idx != -1:
                prompt = prompt[:idx] + date_rule + '\n' + prompt[idx:]
                node['parameters']['messages']['messageValues'][0]['message'] = prompt
                
with open('n8n/K_SieuLuong_V2.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=True, indent=2)

print('Finished')
