import json
import codecs

with open('n8n/K_SieuLuong_V2.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

for node in data['nodes']:
    if node['name'] == 'Extract Intent Chain':
        prompt = node['parameters']['messages']['messageValues'][0]['message']
        
        # Remove the previous rigid patch I did to keep it clean if it exists
        prompt = prompt.replace(
                '[TODAY]. n\u1ebfu user h\u1ecfi th\u1eddi gian nh\u01b0 "h\u00f4m qua" -> @TuNgay=[YESTERDAY], @DenNgay=[YESTERDAY]. N\u1ebfu h\u1ecfi "th\u00e1ng n\u00e0y"/"th\u00e1ng nay" -> @TuNgay=[THIS_MONTH_START], @DenNgay=[TODAY]. N\u1ebfu h\u1ecfi "n\u0103m n\u00e0y"/"n\u0103m nay" -> @TuNgay=[THIS_YEAR_START], @DenNgay=[TODAY].',
                '[TODAY].'
            )
        prompt = prompt.replace(
                '[TODAY]. N\u1ebfu user h\u1ecfi th\u1eddi gian nh\u01b0 "h\u00f4m qua" -> @TuNgay=[YESTERDAY], @DenNgay=[YESTERDAY]. N\u1ebfu h\u1ecfi "th\u00e1ng n\u00e0y"/"th\u00e1ng nay" -> @TuNgay=[THIS_MONTH_START], @DenNgay=[TODAY]. N\u1ebfu h\u1ecfi "n\u0103m n\u00e0y"/"n\u0103m nay" -> @TuNgay=[THIS_YEAR_START], @DenNgay=[TODAY].',
                '[TODAY].'
            )

        if 'Quy \u0110\u1ed5i Th\u1eddi Gian' not in prompt:
            date_rule = "\n\n4.5 Quy \u0110\u1ed5i Th\u1eddi Gian (T\u1ef1 \u0111\u1ed9ng t\u00ednh ng\u00e0y)\nB\u1ea4T C\u1ee8 KHI N\u00c0O user nh\u1eafc \u0111\u1ebfn m\u1ed1c ho\u1eb7c kho\u1ea3ng th\u1eddi gian (n\u0103m nay, th\u00e1ng tr\u01b0\u1edbc, n\u0103m ngo\u00e1i, th\u00e1ng m\u1ea5y...), b\u1ea1n PH\u1ea2I T\u1ef0 \u0110\u1ed8NG T\u00cdNH TO\u00c1N sang chu\u1ea9n YYYY-MM-DD \u0111\u1ec3 g\u00e1n cho @TuNgay v\u00e0 @DenNgay d\u1ef1a v\u00e0o ng\u00e0y h\u00f4m nay.\nVD \"n\u0103m nay\" -> T\u1eeb ng\u00e0y \u0111\u1ea7u ti\u00ean c\u1ee7a n\u0103m \u0111\u1ebfn h\u00f4m nay.\nVD \"th\u00e1ng tr\u01b0\u1edbc\" -> t\u1eeb m\u1ed3ng 1 \u0111\u1ebfn ng\u00e0y cu\u1ed1i c\u1ee7a th\u00e1ng tr\u01b0\u1edbc.\n"
            prompt = prompt.replace('4. D\u1ecbch T\u1eeb Vi\u1ebft', date_rule + '4. D\u1ecbch T\u1eeb Vi\u1ebft')
            
            node['parameters']['messages']['messageValues'][0]['message'] = prompt
            
with open('n8n/K_SieuLuong_V2.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=True, indent=2)

print('Date parsing LLM rules injected!')
