'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Không tìm thấy mốc cập nhật: ${label}`);
  return source.replace(before, after);
}

function updateCodeNode(relativeFile, nodeName, transform) {
  const file = path.join(root, relativeFile);
  const workflow = JSON.parse(fs.readFileSync(file, 'utf8'));
  const node = workflow.nodes.find((entry) => entry.name === nodeName);
  if (!node?.parameters?.jsCode) throw new Error(`Thiếu code node ${nodeName} trong ${relativeFile}`);
  node.parameters.jsCode = transform(node.parameters.jsCode.replace(/\r\n/g, '\n'));
  fs.writeFileSync(file, JSON.stringify(workflow, null, 2) + '\n');
}

function updateNaturalClassifier(code) {
  code = replaceRequired(
    code,
    '"ASK_PRODUCT_FOR_SEARCH":"Bạn muốn tìm sản phẩm nào?","FOLLOW_UP_NEEDS_CONTEXT"',
    '"ASK_PRODUCT_FOR_SEARCH":"Bạn muốn tìm sản phẩm nào?","ASK_PRODUCT_FOR_PROMOTION":"Bạn muốn xem chương trình bán hàng của sản phẩm nào?","FOLLOW_UP_NEEDS_CONTEXT"',
    'natural response CTBH'
  );
  code = replaceRequired(
    code,
    "    PRODUCT_SEARCH: ['PRODUCT_SEARCH', '@tra_cuu_san_pham', 'searchTerm'],",
    "    PRODUCT_SEARCH: ['PRODUCT_SEARCH', '@tra_cuu_san_pham', 'searchTerm'],\n    PRODUCT_PROMOTION_LOOKUP: ['PRODUCT_PROMOTION_LOOKUP', '@ctbh_san_pham', 'searchTerm'],",
    'context route CTBH'
  );
  code = replaceRequired(
    code,
    "  const productInfoQuery = !/\\btrieu chung\\b/.test(folded)\n    && (",
    "  const productPromotionQuery = /\\b(ctbh|chuong trinh ban hang|khuyen mai)\\b/.test(folded)\n    && /\\b(san pham|hang hoa|thuoc)\\b/.test(folded);\n  const productInfoQuery = !/\\btrieu chung\\b/.test(folded)\n    && (",
    'product promotion signal'
  );
  code = replaceRequired(
    code,
    "    || productInfoQuery\n    || dailyWorkQuery",
    "    || productPromotionQuery\n    || productInfoQuery\n    || dailyWorkQuery",
    'business signal CTBH'
  );
  code = replaceRequired(
    code,
    "    } else if (/\\b(de xuat khuyen mai|can khuyen mai|khuyen mai)\\b/.test(folded)) {\n      internalIntent = 'PROMOTION_REVIEW';",
    "    } else if (productPromotionQuery) {\n      internalIntent = 'PRODUCT_PROMOTION_LOOKUP';\n      apiCode = '@ctbh_san_pham';\n      if (productCode) entities.searchTerm = productCode;\n      else {\n        const match = normalized.originalText.match(/(?:sản phẩm|san pham|hàng hóa|hang hoa|thuốc|thuoc)\\s+(.+?)(?:\\s+(?:có|co)\\s+(?:ctbh|khuyến mãi|khuyen mai).*)?$/i);\n        const term = match ? match[1].replace(/[?.!,;:]+$/g, '').trim() : '';\n        if (term && !/^(?:nào|nao|bất kỳ|bat ky)$/i.test(term)) entities.searchTerm = term;\n        else {\n          missingFields = ['searchTerm'];\n          responseKey = 'ASK_PRODUCT_FOR_PROMOTION';\n        }\n      }\n    } else if (/\\b(de xuat khuyen mai|can khuyen mai|khuyen mai)\\b/.test(folded)) {\n      internalIntent = 'PROMOTION_REVIEW';",
    'route CTBH before review'
  );
  return code;
}

for (const [file, node] of [
  ['n8n/AI_Core/AI_Intent_Parser.json', 'Detect Category & Load FewShots'],
  ['n8n/AI_Core/MAIN_ChatBot_V5.json', 'LIB NormalizeInput']
]) updateCodeNode(file, node, updateNaturalClassifier);

updateCodeNode('n8n/AI_Core/AI_Intent_Parser.json', 'Parse & Resolve Placeholders', (code) => {
  code = replaceRequired(code, '"PRODUCT_SEARCH","FOCUS_PRODUCTS"', '"PRODUCT_SEARCH","PRODUCT_PROMOTION_LOOKUP","FOCUS_PRODUCTS"', 'parser intent allowlist');
  return replaceRequired(
    code,
    '"ASK_PRODUCT_FOR_SEARCH":"Bạn muốn tìm sản phẩm nào?","FOLLOW_UP_NEEDS_CONTEXT"',
    '"ASK_PRODUCT_FOR_SEARCH":"Bạn muốn tìm sản phẩm nào?","ASK_PRODUCT_FOR_PROMOTION":"Bạn muốn xem chương trình bán hàng của sản phẩm nào?","FOLLOW_UP_NEEDS_CONTEXT"',
    'parser response CTBH'
  );
});

updateCodeNode('n8n/AI_Core/MAIN_ChatBot_V5.json', 'LIB ConfidenceDecision', (code) => replaceRequired(
  code,
  '"PRODUCT_SEARCH":{"apiCode":"@tra_cuu_san_pham","risk":"CATALOG","requiredEntities":["searchTerm"]},',
  '"PRODUCT_SEARCH":{"apiCode":"@tra_cuu_san_pham","risk":"CATALOG","requiredEntities":["searchTerm"]},"PRODUCT_PROMOTION_LOOKUP":{"apiCode":"@ctbh_san_pham","risk":"CATALOG","requiredEntities":["searchTerm"]},',
  'confidence intent map CTBH'
));

updateCodeNode('n8n/AI_Core/MAIN_ChatBot_V5.json', 'LIB ValidateParams', (code) => {
  code = replaceRequired(code, 'these 24 read APIs', 'these 25 read APIs', 'allowlist comment count');
  code = replaceRequired(code, "'@goi_ydon_thuoc', '@danh_sach_tonkho', '@tra_cuu_san_pham',", "'@goi_ydon_thuoc', '@danh_sach_tonkho', '@tra_cuu_san_pham', '@ctbh_san_pham',", 'natural API allowlist');
  code = replaceRequired(code, "'Yêu cầu này chưa thuộc 24 API đã được duyệt.'", "'Yêu cầu này chưa thuộc 25 API đã được duyệt.'", 'validation message count');
  return replaceRequired(code, "  '@tra_cuu_san_pham':   { required: ['@timkiem'],     types: { '@timkiem': 'string' } },", "  '@tra_cuu_san_pham':   { required: ['@timkiem'],     types: { '@timkiem': 'string' } },\n  '@ctbh_san_pham':       { required: ['@timkiem'],     types: { '@timkiem': 'string', '@TopN': 'number' } },", 'validation schema CTBH');
});

updateCodeNode('n8n/API_Services/API_GetConfig.json', 'Authorize GetConfig', (code) => replaceRequired(
  code,
  '"@tra_cuu_san_pham","@san_pham_trong_tam"',
  '"@tra_cuu_san_pham","@ctbh_san_pham","@san_pham_trong_tam"',
  'GetConfig allowlist CTBH'
));

updateCodeNode('n8n/API_Services/API_Execute.json', 'Enforce API Capability', (code) => replaceRequired(
  code,
  "'@goi_ydon_thuoc', '@danh_sach_tonkho', '@tra_cuu_san_pham',",
  "'@goi_ydon_thuoc', '@danh_sach_tonkho', '@tra_cuu_san_pham', '@ctbh_san_pham',",
  'Execute allowlist CTBH'
));

updateCodeNode('n8n/API_Services/API_Execute.json', 'Validate API Request', (code) => replaceRequired(
  code,
  "if (apiCode === '@tra_cuu_san_pham') requireOne(['@timkiem', '@keyword'], '@timkiem');",
  "if (['@tra_cuu_san_pham', '@ctbh_san_pham'].includes(apiCode)) requireOne(['@timkiem', '@keyword'], '@timkiem');",
  'Execute validation CTBH'
));

function updateTelegramFormatter(code) {
  code = replaceRequired(
    code,
    "  programname: 'Chương trình',",
    "  programname: 'Chương trình',\n  promotionname: 'Tên CTBH',\n  promotionsummary: 'Ưu đãi',\n  activepromotioncount: 'Số CTBH đang áp dụng',\n  ghichu: 'Ghi chú CTBH',\n  ruletype: 'Loại điều kiện',\n  minimumquantity: 'SL tối thiểu',\n  maximumquantity: 'SL tối đa',\n  discountpercent: '% giảm',\n  giftitemid: 'Mã hàng tặng',\n  giftquantity: 'SL tặng',\n  effectivefrom: 'Từ ngày',\n  effectiveto: 'Đến ngày',",
    'Telegram CTBH labels'
  );
  if (!code.includes("  '@ctbh_san_pham': {")) {
    code = replaceRequired(
      code,
      "  '@cong_no_khach_hang': {",
      "  '@ctbh_san_pham': {\n    title: 'Chương trình bán hàng theo sản phẩm',\n    noData: 'Không tìm thấy sản phẩm hoặc CTBH phù hợp trong phạm vi tài khoản của bạn.',\n    fields: ['Mã sp','Mã Sản Phẩm','ItemID','Sản Phẩm','Tên Sản Phẩm','ItemName','Đơn Giá','AvailableStock','Tên CTBH','PromotionName','Ưu đãi','PromotionSummary','Số CTBH đang áp dụng','ActivePromotionCount','Ghi chú CTBH','GhiChu','Từ ngày','EffectiveFrom','Đến ngày','EffectiveTo','SL tối thiểu','MinimumQuantity','SL tối đa','MaximumQuantity','% giảm','DiscountPercent','Mã hàng tặng','GiftItemID','SL tặng','GiftQuantity']\n  },\n  '@cong_no_khach_hang': {",
      'Telegram CTBH profile'
    );
  }
  return replaceRequired(
    code,
    "fields: ['Mã Sản Phẩm','ItemID','Tên Sản Phẩm','ItemName','Tên CTBH'",
    "fields: ['Mã sp','Mã Sản Phẩm','ItemID','Sản Phẩm','Tên Sản Phẩm','ItemName','Đơn Giá','AvailableStock','Tên CTBH'",
    'Telegram CTBH ERP field aliases'
  );
}

updateCodeNode('n8n/Telegram/TG_ChatBot_Demo.json', 'Format Chatbot Reply', updateTelegramFormatter);

const generatorFile = path.join(root, 'scripts/update_telegram_pilot_n8n.js');
let generator = fs.readFileSync(generatorFile, 'utf8');
generator = updateTelegramFormatter(generator);
fs.writeFileSync(generatorFile, generator);

console.log('CUSTOMER-REQUESTS n8n update: PASS');
