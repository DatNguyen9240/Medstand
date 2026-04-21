import json
import re

with open('n8n/K_SieuLuong_V2.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for node in data['nodes']:
    if node['name'] == 'Extract Intent Chain':
        prompt = node['parameters']['messages']['messageValues'][0]['message']
        
        # 1. Insert Rule 4.5
        rule = '\n\n4.5 Quy Doi Thoi Gian (Tu dong tinh ngay)\nBAT CU KHI NAO user nhac den moc hoac khoang thoi gian (nam nay, thang truoc, nam ngoai, thang may...),\nban PHAI TU DONG thay the sang cac MA duoi day cho @TuNgay va @DenNgay.\n- "hom nay" -> [TODAY]\n- "hom qua" -> [YESTERDAY]\n- "thang nay"/"thang nay" -> @TuNgay=[THIS_MONTH_START], @DenNgay=[TODAY]\n- "nam nay"/"nam nay" -> @TuNgay=[THIS_YEAR_START], @DenNgay=[TODAY]\n- Cac truong hop khac tu suy luan ra YYYY-MM-DD\n\n'
        
        prompt = prompt.replace('\n\n5. ', rule + '5. ')
        
        # 2. Fix @doanh_so
        # Replacing the exact problem part.
        # "params: không ép buộc" or whatever it is, typically between "doanh_so:" and "dùng để"
        # We can just use powerful regex that doesn't care about the unicode chars exactly!
        # find anything like @doanh_so: and replace the params part
        prompt = re.sub(
            r'@doanh_so:(.*?)params:[^\)]+\)(.*?)\n',
            r'@doanh_so:\1(TUYET DOI PHAI ext_param @TuNgay, @DenNgay neu nhac tg. neu Top KH->@LoaiBaoCao="KhachHang", Top NV->@LoaiBaoCao="NhanVien")\2\n',
            prompt
        )
        
        node['parameters']['messages']['messageValues'][0]['message'] = prompt
        
    if node['name'] == 'Parse Intent & Auth':
        jsCode = node['parameters']['jsCode']
        new_placeholders = '''const yyyy = now.getFullYear();
const mm = (now.getMonth() + 1).toString().padStart(2, "0");
const yest = new Date(now); yest.setDate(yest.getDate() - 1);
const y_yyyy = yest.getFullYear(); const y_mm = (yest.getMonth() + 1).toString().padStart(2, "0"); const y_dd = yest.getDate().toString().padStart(2, "0");
const placeholders = { 
  '[TODAY]': toLocalISO(now),
  '[YESTERDAY]': y_yyyy + "-" + y_mm + "-" + y_dd,
  '[THIS_MONTH_START]': yyyy + "-" + mm + "-01",
  '[THIS_YEAR_START]': yyyy + "-01-01"
};'''
        jsCode = re.sub(
            r'const placeholders = {.*?};',
            new_placeholders,
            jsCode,
            flags=re.DOTALL
        )
        node['parameters']['jsCode'] = jsCode

with open('n8n/K_SieuLuong_V2.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print('Success!')
