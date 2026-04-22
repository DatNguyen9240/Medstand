import json
import codecs

with open('n8n/K_SieuLuong_V2.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

for node in data['nodes']:
    if node['name'] == 'Extract Intent Chain':
        prompt = node['parameters']['messages']['messageValues'][0]['message']
        if '[THIS_YEAR_START]' not in prompt:
            prompt = prompt.replace(
                '[TODAY].',
                '[TODAY]. N\u1ebfu user h\u1ecfi th\u1eddi gian nh\u01b0 "h\u00f4m qua" -> @TuNgay=[YESTERDAY], @DenNgay=[YESTERDAY]. N\u1ebfu h\u1ecfi "th\u00e1ng n\u00e0y"/"th\u00e1ng nay" -> @TuNgay=[THIS_MONTH_START], @DenNgay=[TODAY]. N\u1ebfu h\u1ecfi "n\u0103m n\u00e0y"/"n\u0103m nay" -> @TuNgay=[THIS_YEAR_START], @DenNgay=[TODAY].'
            )
            node['parameters']['messages']['messageValues'][0]['message'] = prompt

    if node['name'] == 'Parse Intent & Auth':
        jsCode = node['parameters']['jsCode']
        if 'THIS_YEAR_START' not in jsCode:
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
            jsCode = jsCode.replace("const placeholders = { '[TODAY]': toLocalISO(now) };", new_placeholders)
            jsCode = jsCode.replace('const placeholders = { \"[TODAY]\": toLocalISO(now) };', new_placeholders)
            node['parameters']['jsCode'] = jsCode

with open('n8n/K_SieuLuong_V2.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=True, indent=2)

print('N8N logic patched!')
