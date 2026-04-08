import json

path = r'c:\Git cua tui\Medstand\HoangDang\n8n\K_SieuLuong.json'
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# Define the HTTP Request node parameters
HTTP_PARAMS = {
    "method": "POST",
    "url": "https://medtest.bms79.com/api/chatbot-action",
    "sendHeaders": True,
    "headerParameters": {
        "parameters": [
            {
                "name": "Authorization",
                "value": "={{ $json.token }}"
            },
            {
                "name": "Content-Type",
                "value": "application/json"
            }
        ]
    },
    "sendBody": True,
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify({\n  ApiCode:   $json.ApiCode,\n  params:    $json.params,\n  isConfirm: $json.isConfirm\n}) }}",
    "options": {
        "timeout": 30000
    }
}

patched = 0
for node in data['nodes']:
    name = node.get('name', '')
    if name in ('Goi Backend API', 'Goi Backend AI Analytics'):
        node['type'] = 'n8n-nodes-base.httpRequest'
        if 'credentials' in node:
            del node['credentials']
        node['parameters'] = HTTP_PARAMS.copy()
        print('Restored HTTP on:', name)
        patched += 1

# We also need to restore Parse Input Co Ban and Parse Input Nang Cao
# to their original format because the previous script changed them to SQL mapping!
JS_PARSE_COBAN_ORIGINAL = """
const raw = $input.item.json;
const body = raw.body || raw;
const headers = raw.headers || {};

const ApiCode = (body.ApiCode || '').trim();
const username = body.username || 'default';
const isConfirm = parseInt(body.isConfirm || '0', 10);
const token = body.token || 'Bearer empty';

let params = {};
if (typeof body.params === 'string') {
  try {
    params = JSON.parse(body.params);
  } catch(e) {
    params = {};
  }
} else if (typeof body.params === 'object' && body.params !== null) {
  params = body.params;
}

if (!ApiCode) {
  return [{ json: { hop_le: false, loi: true, message: 'Thieu ApiCode' } }];
}
if (!ApiCode.startsWith('@')) {
  return [{ json: { hop_le: false, loi: true, message: 'ApiCode khong hop le, phai bat dau bang @' } }];
}

return [{
  json: {
    hop_le: true,
    ApiCode,
    params,
    isConfirm,
    username,
    token
  }
}];
""".strip()

JS_FORMAT_COBAN_ORIGINAL = """
const items = $input.all();
let payload = [];

try {
  if (items.length > 0) {
    const firstItem = items[0].json;
    if (firstItem && firstItem.data) {
      payload = firstItem.data;
    } else if (firstItem && typeof firstItem === 'object' && !Array.isArray(firstItem)) {
      payload = firstItem;
    } else {
      payload = items.map(item => item.json).filter(r => r && Object.keys(r).length > 0);
    }
    
    // Bắt lỗi từ trả về C#
    if (firstItem && firstItem.error) {
      return [{
        json: {
          ket_qua: 'Loi tu Back-end: ' + (firstItem.message || JSON.stringify(firstItem.error)),
          loi: true
        }
      }];
    }
    
    // Nếu là form cần xác nhận
    if (firstItem && firstItem.isConfirm_Review) {
      return [{
        json: {
          ket_qua: firstItem.message || "Vui lòng xác nhận để thực thi.",
          isConfirm_Review: true,
          so_ban_ghi: 0
        }
      }];
    }
  }
} catch (e) {
  payload = items.map(item => item.json);
}

if (!payload || payload.length === 0 || (Object.keys(payload).length === 0)) {
  return [{
    json: {
      ket_qua: 'Khong tim thay du lieu phu hop.',
      so_ban_ghi: 0
    }
  }];
}

if (!Array.isArray(payload)) {
  payload = [payload];
}

const keys = Object.keys(payload[0]).filter(k => !k.startsWith('_'));
const total = payload.length;

let text = 'Tim thay ' + total + ' ket qua:\\n\\n';
text += '| STT | ' + keys.join(' | ') + ' |\\n';
text += '|---|' + keys.map(() => '---').join('|') + ' |\\n';
text += payload.slice(0, 20).map((row, i) => {
  return '| ' + (i + 1) + ' | ' + keys.map(k => String(row[k] !== null && row[k] !== undefined ? row[k] : '').replace(/\\|/g, '-')).join(' | ') + ' |';
}).join('\\n');

if (total > 20) {
  text += '\\n\\n... va ' + (total - 20) + ' kết quả khác.';
}

const inputData = $('Parse Input Co Ban').item.json;
const ApiCode = inputData ? inputData.ApiCode : '';

return [{
  json: {
    ket_qua: text,
    so_ban_ghi: total,
    ApiCode: ApiCode
  }
}];
""".strip()

for node in data['nodes']:
    name = node.get('name', '')
    if name == 'Parse Input Co Ban':
        node['parameters']['jsCode'] = JS_PARSE_COBAN_ORIGINAL
    elif name == 'Parse Input Nang Cao':
        node['parameters']['jsCode'] = JS_PARSE_COBAN_ORIGINAL
    elif name == 'Format Ket Qua Co Ban':
        node['parameters']['jsCode'] = JS_FORMAT_COBAN_ORIGINAL
    elif name == 'Format Ket Qua Nang Cao':
        node['parameters']['jsCode'] = JS_FORMAT_COBAN_ORIGINAL

with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print('Updated K_SieuLuong.json to restore C# HTTP Requests!')
