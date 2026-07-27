'use strict';

const SCHEMA_VERSION = '1.0.0';

const RESPONSES = Object.freeze({
  CASUAL_GREETING:
    'Xin chào! Tôi có thể hỗ trợ tra cứu doanh số, khách hàng, công nợ, tồn kho và gợi ý bán hàng.',
  CASUAL_THANKS: 'Rất vui được hỗ trợ bạn. Bạn có thể tiếp tục hỏi nghiệp vụ Medstand bất cứ lúc nào.',
  CASUAL_CAPABILITIES:
    'Tôi hỗ trợ tra cứu doanh số, khách hàng, công nợ, tồn kho và gợi ý bán hàng trong phạm vi được phân quyền.',
  BOT_IDENTITY_QUERY:
    'Tôi là Medstand AI, trợ lý hỗ trợ tra cứu dữ liệu và nghiệp vụ bán hàng trong phạm vi được phân quyền.',
  USER_IDENTITY_QUERY:
    'Tôi sẽ trả thông tin của tài khoản đang đăng nhập từ danh tính đã được hệ thống xác thực.',
  USER_ROLE_QUERY:
    'Tôi sẽ trả vai trò của tài khoản đang đăng nhập từ danh tính đã được hệ thống xác thực.',
  USER_SCOPE_QUERY:
    'Tôi sẽ trả phạm vi dữ liệu của tài khoản đang đăng nhập từ thông tin đã được hệ thống xác thực.',
  CASUAL_UNDERSTAND_CONFIRMATION:
    'Tôi vẫn hiểu cách nhắn tự nhiên và một số từ viết tắt. Bạn có thể hỏi về doanh số, khách hàng, công nợ, tồn kho hoặc gợi ý bán hàng.',
  UNSUPPORTED_OUTSIDE_MEDSTAND_SCOPE:
    'Hiện tôi chưa hỗ trợ nội dung này. Tôi chuyên hỗ trợ các nghiệp vụ Medstand như doanh số, công nợ và tồn kho.',
  UNKNOWN_REPHRASE:
    'Tôi chưa hiểu rõ yêu cầu. Bạn có thể diễn đạt lại hoặc chọn một chức năng bên dưới.',
  MUTATION_PREVIEW_ONLY:
    'Giai đoạn Pilot hiện chỉ hỗ trợ tra cứu hoặc xem trước. Hệ thống chưa ghi dữ liệu thật từ hội thoại.',
  ASK_CUSTOMER_FOR_DEBT: 'Bạn muốn xem công nợ của khách hàng nào?',
  ASK_PRODUCT_FOR_INVENTORY: 'Bạn muốn kiểm tra tồn kho của sản phẩm nào?',
  ASK_CUSTOMER_FOR_ORDER_RECOMMENDATION: 'Bạn muốn xem gợi ý đơn hàng cho khách hàng nào?',
  ASK_DOCUMENT_FOR_INVOICE_DETAIL: 'Bạn muốn xem chi tiết hóa đơn nào?',
  ASK_CUSTOMER_FOR_SURVEY: 'Bạn muốn xem thông tin khảo sát của khách hàng nào?',
  ASK_CUSTOMER_FOR_UPSELL: 'Bạn muốn xem gợi ý bán kèm cho khách hàng nào?',
  ASK_CUSTOMER_FOR_LOYALTY: 'Bạn muốn xem tiến độ tích lũy của khách hàng nào?',
  ASK_PRODUCT_FOR_PRESCRIPTION: 'Bạn muốn xem gợi ý đơn thuốc cho sản phẩm nào?',
  ASK_PRODUCT_FOR_SEARCH: 'Bạn muốn tìm sản phẩm nào?',
  FOLLOW_UP_NEEDS_CONTEXT:
    'Bạn muốn tiếp tục với kết quả nào? Hãy chọn lại khách hàng hoặc chức năng cần xem.',
  ASK_VALID_DATE_RANGE:
    'Vui lòng nhập đủ khoảng ngày hợp lệ, ví dụ: từ 09/07/2026 đến 20/07/2026.',
});

function isErpCode(token) {
  return /^[A-Z]{1,8}[A-Z0-9._-]*\d{2,}[A-Z0-9._-]*$/i.test(String(token || ''));
}

function foldForMatch(value) {
  return String(value || '')
    .replace(/^\s*\d+[.)-]\s*/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9@._/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNaturalText(input) {
  const originalText = String(input || '').replace(/\s+/g, ' ').trim();
  const rawTokens = originalText.split(' ');
  const replacements = new Map([
    ['tui', 'tôi'],
    ['ko', 'không'],
    ['k', 'không'],
    ['z', 'vậy'],
    ['dc', 'được'],
    ['đc', 'được'],
    ['r', 'rồi'],
    ['trc', 'trước'],
    ['cn', 'công nợ'],
    ['sp', 'sản phẩm'],
    ['ds', 'doanh số'],
    ['h', 'giờ'],
  ]);

  const normalized = rawTokens.map((token, index) => {
    const clean = token.replace(/^[^\p{L}\p{N}@]+|[^\p{L}\p{N}._@/-]+$/gu, '');
    if (!clean || isErpCode(clean) || /^@[a-z0-9_]+$/i.test(clean)) return token;
    const lowered = clean.toLowerCase();
    let replacement = replacements.get(lowered);
    if (lowered === 'kh') {
      const next = (rawTokens[index + 1] || '').replace(/[^A-Za-z0-9._-]/g, '');
      replacement = isErpCode(next) ? 'khách hàng' : 'không';
    }
    if (!replacement) return token.toLowerCase();
    return token.replace(clean, replacement);
  });

  return {
    originalText,
    normalizedText: normalized.join(' ').replace(/\s+/g, ' ').trim(),
  };
}

function extractErpCode(originalText) {
  const tokens = String(originalText || '').match(/[A-Za-z][A-Za-z0-9._-]*\d{2,}[A-Za-z0-9._-]*/g) || [];
  return tokens.find(isErpCode) || null;
}

function extractLastErpCode(originalText) {
  const tokens = String(originalText || '').match(/[A-Za-z][A-Za-z0-9._-]*\d{2,}[A-Za-z0-9._-]*/g) || [];
  return [...tokens].reverse().find(isErpCode) || null;
}

function getRecentUserMessages(historyContext) {
  const lines = String(historyContext || '').split(/\r?\n/);
  const userMessages = lines
    .map((line) => line.match(/^\s*(?:user|người dùng)\s*:\s*(.+)$/i))
    .filter(Boolean)
    .map((match) => match[1].trim())
    .filter(Boolean);
  if (userMessages.length) return userMessages.slice(-6);
  const fallback = String(historyContext || '').trim();
  return fallback ? [fallback] : [];
}

function inferContextRoute(historyContext, lastIntent = '') {
  const byIntent = {
    CUSTOMER_DEBT_DETAIL: ['CUSTOMER_DEBT_DETAIL', '@cong_no_chi_tiet', 'customerId'],
    CUSTOMER_DEBT_SUMMARY: ['CUSTOMER_DEBT_DETAIL', '@cong_no_chi_tiet', 'customerId'],
    INVENTORY_LIST: ['INVENTORY_LIST', '@danh_sach_tonkho', 'searchTerm'],
    PRODUCT_SEARCH: ['PRODUCT_SEARCH', '@tra_cuu_san_pham', 'searchTerm'],
    ORDER_RECOMMENDATION: ['ORDER_RECOMMENDATION', '@goi_ydon_hang', 'customerId'],
    UPSELL_RECOMMENDATION: ['UPSELL_RECOMMENDATION', '@upsell_goi_y', 'customerId'],
    LOYALTY_PROGRESS: ['LOYALTY_PROGRESS', '@tich_luy', 'customerId'],
    SALES_REVENUE: ['SALES_REVENUE', '@doanh_so', null],
    SALES_ROUTE: ['SALES_ROUTE', '@tuyen_ban_hang', null],
    INVOICE_LIST: ['INVOICE_LIST', '@hoa_don', null],
    ORDER_LIST: ['ORDER_LIST', '@don_hang', null],
    SURVEY_360: ['SURVEY_360', '@khao_sat360', 'customerId'],
    SURVEY_STATUS: ['SURVEY_STATUS', '@kiem_tra_khao_sat', 'customerId'],
  };
  const normalizedIntent = String(lastIntent || '').trim().toUpperCase();
  if (byIntent[normalizedIntent]) {
    const [intent, apiCode, entityKey] = byIntent[normalizedIntent];
    return { intent, apiCode, entityKey, code: extractLastErpCode(historyContext) };
  }

  const messages = getRecentUserMessages(historyContext).reverse();
  for (const message of messages) {
    const text = foldForMatch(message);
    let route = null;
    if (/\b(cong no|chi tiet no|con no|no bao nhieu|khoan nao chua tra)\b/.test(text)) {
      route = byIntent.CUSTOMER_DEBT_DETAIL;
    } else if (/\b(goi y ban kem|ban kem|upsell)\b/.test(text)) {
      route = byIntent.UPSELL_RECOMMENDATION;
    } else if (/\b(goi y don hang|hom nay ban gi|nen ban gi|nen nhap gi|nen lay gi)\b/.test(text)) {
      route = byIntent.ORDER_RECOMMENDATION;
    } else if (/\b(tich luy|moc thuong|qua tang)\b/.test(text)) {
      route = byIntent.LOYALTY_PROGRESS;
    } else if (/\b(ton kho|con hang|con bao nhieu)\b/.test(text)) {
      route = byIntent.INVENTORY_LIST;
    } else if (/\b(thong tin san pham|tra cuu san pham|tim san pham)\b/.test(text)) {
      route = byIntent.PRODUCT_SEARCH;
    } else if (/\b(doanh so|doanh thu)\b/.test(text)) {
      route = byIntent.SALES_REVENUE;
    } else if (/\b(tuyen ban hang|khach nao lau chua mua|hom nay.*(?:lam gi|ghe))\b/.test(text)) {
      route = byIntent.SALES_ROUTE;
    } else if (/\b(hoa don)\b/.test(text)) {
      route = byIntent.INVOICE_LIST;
    } else if (/\b(don hang)\b/.test(text)) {
      route = byIntent.ORDER_LIST;
    }
    if (route) {
      const [intent, apiCode, entityKey] = route;
      return { intent, apiCode, entityKey, code: extractLastErpCode(message) };
    }
  }
  return null;
}

function toIsoLocalDate(date) {
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function resolveRelativeDateRange(period, nowInput) {
  const now = nowInput instanceof Date ? new Date(nowInput.getTime()) : new Date(nowInput || Date.now());
  if (Number.isNaN(now.getTime())) return null;
  let fromDate;
  let toDate;
  if (period === 'LAST_MONTH') {
    fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    toDate = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (period === 'LAST_WEEK') {
    const day = now.getDay() || 7;
    const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
    fromDate = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 7);
    toDate = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 1);
  } else {
    return null;
  }
  return { fromDate: toIsoLocalDate(fromDate), toDate: toIsoLocalDate(toDate) };
}

function parseExplicitDateToken(token) {
  const value = String(token || '').trim();
  let year;
  let month;
  let day;
  let match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    match = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (!match) return null;
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;

  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}

function extractExplicitDateRange(input) {
  const tokens = String(input || '').match(
    /\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/g,
  ) || [];
  if (!tokens.length) return { mentioned: false, valid: true, fromDate: null, toDate: null };
  if (tokens.length < 2) return { mentioned: true, valid: false, fromDate: null, toDate: null };

  const fromDate = parseExplicitDateToken(tokens[0]);
  const toDate = parseExplicitDateToken(tokens[1]);
  return {
    mentioned: true,
    valid: Boolean(fromDate && toDate),
    fromDate,
    toDate,
  };
}

function baseResult(normalized, overrides) {
  return {
    schemaVersion: SCHEMA_VERSION,
    messageType: 'UNKNOWN',
    intent: null,
    internalIntent: null,
    apiCode: null,
    confidence: 0,
    entities: {},
    missingFields: [],
    requiresClarification: true,
    supported: false,
    responseKey: 'UNKNOWN_REPHRASE',
    responseMessage: RESPONSES.UNKNOWN_REPHRASE,
    originalText: normalized.originalText,
    normalizedText: normalized.normalizedText,
    ...overrides,
  };
}

function classifyNaturalMessage(input, options = {}) {
  const normalized = normalizeNaturalText(input);
  const folded = foldForMatch(normalized.normalizedText);
  const originalCode = extractErpCode(normalized.originalText);
  const historyContext = String(options.history || options.historyContext || '');
  const contextLastIntent = String(options.lastIntent || '').toLowerCase();
  const contextRoute = inferContextRoute(historyContext, contextLastIntent);
  const contextCode = String(
    options.customerId
    || options.searchTerm
    || contextRoute?.code
    || extractLastErpCode(historyContext)
    || '',
  ).trim();
  const hasContext = Boolean(options.hasContext || historyContext || contextCode || contextLastIntent);

  if (!folded) {
    return baseResult(normalized, { confidence: 1 });
  }

  if (/\b(ban co hieu|co hieu toi|hieu toi khong|hieu toi noi khong|nhan vay hieu|nhan z hieu|hieu khong nhi|hieu kh nhi)\b/.test(folded)) {
    return baseResult(normalized, {
      messageType: 'CASUAL_META',
      confidence: 0.99,
      requiresClarification: false,
      supported: true,
      responseKey: 'CASUAL_UNDERSTAND_CONFIRMATION',
      responseMessage: RESPONSES.CASUAL_UNDERSTAND_CONFIRMATION,
    });
  }

  if (/^(xin chao|chao|hello|hi|alo|e|ê)(\s+(ban|bot|tro ly|anh|chi|nha|nhe|a))?$/.test(folded)) {
    return baseResult(normalized, {
      messageType: 'CASUAL',
      confidence: 0.99,
      requiresClarification: false,
      supported: true,
      responseKey: 'CASUAL_GREETING',
      responseMessage: RESPONSES.CASUAL_GREETING,
    });
  }

  if (/\b(cam on|thanks|thank you)\b/.test(folded)) {
    return baseResult(normalized, {
      messageType: 'CASUAL',
      confidence: 0.99,
      requiresClarification: false,
      supported: true,
      responseKey: 'CASUAL_THANKS',
      responseMessage: RESPONSES.CASUAL_THANKS,
    });
  }

  const correctionToUserIdentity = /\b(toi chu toi khong hoi ban|toi chu khong hoi ban|khong toi hoi toi|khong hoi ban hoi toi|toi hoi toi co|y toi la toi|y la toi hoi toi la ai|toi dang hoi toi la ai|tai khoan cua toi co)\b/.test(folded);
  if (correctionToUserIdentity) {
    return baseResult(normalized, {
      messageType: 'CASUAL_META',
      confidence: 0.99,
      requiresClarification: false,
      supported: true,
      responseKey: 'USER_IDENTITY_QUERY',
      responseMessage: RESPONSES.USER_IDENTITY_QUERY,
    });
  }

  if (/\b(tui hoi ban la ai|toi hoi ban la ai|ban la ai|bot la ai|medstand ai la gi)\b/.test(folded)) {
    return baseResult(normalized, {
      messageType: 'CASUAL_META',
      confidence: 0.99,
      requiresClarification: false,
      supported: true,
      responseKey: 'BOT_IDENTITY_QUERY',
      responseMessage: RESPONSES.BOT_IDENTITY_QUERY,
    });
  }

  if (/\b(ban lam duoc gi|ban giup duoc gi|chuc nang cua ban)\b/.test(folded)) {
    return baseResult(normalized, {
      messageType: 'CASUAL_META',
      confidence: 0.99,
      requiresClarification: false,
      supported: true,
      responseKey: 'CASUAL_CAPABILITIES',
      responseMessage: RESPONSES.CASUAL_CAPABILITIES,
    });
  }

  if (/\b(vai tro cua toi|toi co vai tro gi|toi la sale hay quan ly|toi la quan ly hay sale)\b/.test(folded)) {
    return baseResult(normalized, {
      messageType: 'CASUAL_META',
      confidence: 0.99,
      requiresClarification: false,
      supported: true,
      responseKey: 'USER_ROLE_QUERY',
      responseMessage: RESPONSES.USER_ROLE_QUERY,
    });
  }

  if (/\b(toi duoc xem (du lieu nao|khach nao|nhung gi)|pham vi cua toi|chi nhanh cua toi|khu vuc cua toi)\b/.test(folded)) {
    return baseResult(normalized, {
      messageType: 'CASUAL_META',
      confidence: 0.99,
      requiresClarification: false,
      supported: true,
      responseKey: 'USER_SCOPE_QUERY',
      responseMessage: RESPONSES.USER_SCOPE_QUERY,
    });
  }

  if (/\b(toi la ai|minh la ai|ten toi la gi|toi dang dang nhap tai khoan nao|tai khoan cua toi la gi|ban biet toi la ai khong)\b/.test(folded)) {
    return baseResult(normalized, {
      messageType: 'CASUAL_META',
      confidence: 0.99,
      requiresClarification: false,
      supported: true,
      responseKey: 'USER_IDENTITY_QUERY',
      responseMessage: RESPONSES.USER_IDENTITY_QUERY,
    });
  }

  const unsupportedTopic = /\b(thoi tiet|bong da|ket qua xo so|bai tho|viet tho|dich sang tieng anh|gia vang|chung khoan)\b/.test(folded);
  if (unsupportedTopic) {
    let topic = 'OTHER';
    if (folded.includes('thoi tiet')) topic = 'WEATHER';
    else if (folded.includes('bong da')) topic = 'SPORTS';
    else if (folded.includes('bai tho') || folded.includes('viet tho')) topic = 'POETRY';
    else if (folded.includes('dich sang')) topic = 'TRANSLATION';
    return baseResult(normalized, {
      messageType: 'UNSUPPORTED',
      confidence: 0.99,
      entities: { topic },
      requiresClarification: false,
      supported: false,
      responseKey: 'UNSUPPORTED_OUTSIDE_MEDSTAND_SCOPE',
      responseMessage: RESPONSES.UNSUPPORTED_OUTSIDE_MEDSTAND_SCOPE,
    });
  }

  const mutation = /\b(tao|them|sua|xoa|duyet|huy|ghi)\b.*\b(don hang|hoa don|khuyen mai|khach hang|du lieu)\b/.test(folded);
  if (mutation && !/\b(goi y|xem truoc|tra cuu)\b/.test(folded)) {
    return baseResult(normalized, {
      messageType: 'MUTATION_REQUEST',
      confidence: 0.98,
      requiresClarification: false,
      supported: false,
      responseKey: 'MUTATION_PREVIEW_ONLY',
      responseMessage: RESPONSES.MUTATION_PREVIEW_ONLY,
    });
  }

  if (/^(chi tiet di|xem chi tiet|coi chi tiet|chi tiet hon)$/.test(folded)
    && contextRoute
    && contextCode
    && ['CUSTOMER_DEBT_DETAIL', 'INVENTORY_LIST', 'PRODUCT_SEARCH'].includes(contextRoute.intent)) {
    return baseResult(normalized, {
      messageType: 'BUSINESS',
      intent: contextRoute.intent,
      internalIntent: contextRoute.intent,
      apiCode: contextRoute.apiCode,
      confidence: 0.98,
      entities: { [contextRoute.entityKey]: contextCode },
      requiresClarification: false,
      supported: true,
      responseKey: null,
      responseMessage: '',
    });
  }

  const changeCustomerMatch = folded.match(/^(?:doi sang|xem cho|chuyen sang)(?: khach(?: hang)?)?\s+([a-z][a-z0-9._-]*\d{2,}[a-z0-9._-]*)$/);
  if (changeCustomerMatch && contextRoute && contextRoute.entityKey === 'customerId') {
    const customerId = originalCode;
    if (customerId) {
      return baseResult(normalized, {
        messageType: 'BUSINESS',
        intent: contextRoute.intent,
        internalIntent: contextRoute.intent,
        apiCode: contextRoute.apiCode,
        confidence: 0.98,
        entities: { customerId },
        requiresClarification: false,
        supported: true,
        responseKey: null,
        responseMessage: '',
      });
    }
  }

  const relativePeriod = folded === 'thang truoc thi sao'
    ? 'LAST_MONTH'
    : (folded === 'tuan truoc thi sao' ? 'LAST_WEEK' : null);
  if (
    relativePeriod
    && contextRoute
    && ['SALES_REVENUE', 'LOYALTY_PROGRESS'].includes(contextRoute.intent)
  ) {
    const range = resolveRelativeDateRange(relativePeriod, options.now);
    const entities = range ? { ...range } : {};
    if (contextRoute.entityKey === 'customerId' && contextCode) entities.customerId = contextCode;
    if (contextRoute.entityKey !== 'customerId' || contextCode) {
      return baseResult(normalized, {
        messageType: 'BUSINESS',
        intent: contextRoute.intent,
        internalIntent: contextRoute.intent,
        apiCode: contextRoute.apiCode,
        confidence: 0.98,
        entities,
        requiresClarification: false,
        supported: true,
        responseKey: null,
        responseMessage: '',
      });
    }
  }

  if (/^(thang truoc thi sao|con cai nay|chi tiet hon|chi tiet di|xem chi tiet|coi chi tiet|doi sang khach|cung ky truoc|tuan truoc thi sao)$/.test(folded)) {
    return baseResult(normalized, {
      messageType: 'FOLLOW_UP',
      confidence: 0.96,
      requiresClarification: !hasContext,
      supported: hasContext,
      responseKey: hasContext ? 'FOLLOW_UP_USE_CONTEXT' : 'FOLLOW_UP_NEEDS_CONTEXT',
      responseMessage: hasContext ? '' : RESPONSES.FOLLOW_UP_NEEDS_CONTEXT,
    });
  }

  const debtQuery = folded.includes('cong no')
    || /\b(chi tiet no|con no|no bao nhieu|no nhieu|no gi|con phai tra bao nhieu|khoan nao chua tra|da tra het no|tra het no)\b/.test(folded);
  const inventoryQuery = folded.includes('ton kho')
    || Boolean(originalCode && /\b(con bao nhieu|con hang khong|con hang|het hang chua|kiem tra kho|trong kho con)\b/.test(folded))
    || Boolean(/\b(san pham nay|mat hang nay)\b.*\b(con bao nhieu|con hang|het hang)\b/.test(folded));
  const upsellQuery = /\b(goi y ban kem|ban kem|upsell|ban them gi|kem them gi)\b/.test(folded);
  const orderRecommendationQuery = /\b(goi y don hang|nen ban gi|hom nay ban gi|nen nhap gi|nen lay gi|de xuat hang)\b/.test(folded);
  const productInfoQuery = !/\btrieu chung\b/.test(folded)
    && (
      /\b(tim|tra cuu|thong tin|xem)\b.*\b(san pham|thuoc)\b/.test(folded)
      || (originalCode && /\b(san pham|thuoc|la gi)\b/.test(folded))
    );
  const dailyWorkQuery = /\b(hom nay|nay)\s+(?:(?:toi|tui|minh)\s+)?(?:(?:nen|can)\s+)?(?:lam gi|di dau|ghe dau|ghe ai|ghe khach nao)\b/.test(folded)
    || /\bcong viec hom nay(?: cua (?:toi|tui|minh))?\s+(?:la gi|co gi)\b/.test(folded);
  const longAbsentCustomerQuery = /\b(khach(?: hang)? nao|ai|danh sach khach(?: hang)?)\b.*\b(lau chua mua|chua mua lau|hon mot thang chua mua|khong mua lau|vang mat|bo mua|can goi lai|can cham soc)\b/.test(folded);
  const sellTodayForCustomerQuery = /\b(hom nay\s+)?(?:nen\s+)?ban gi\s+(?:cho\s+)?khach(?: hang)?\b/.test(folded);
  const business = debtQuery
    || inventoryQuery
    || upsellQuery
    || orderRecommendationQuery
    || productInfoQuery
    || dailyWorkQuery
    || longAbsentCustomerQuery
    || sellTodayForCustomerQuery
    || /\b(doanh so|doanh thu|hoa don|don hang|ton kho|san pham|khach hang|goi y|ban kem|tich luy|tuyen|cham diem|khuyen mai|danh muc|khao sat|thong bao)\b/.test(folded);
  if (business) {
    let internalIntent = null;
    let apiCode = null;
    let entities = {};
    let missingFields = [];
    let responseKey = null;
    const refersToCurrentCustomer = /\b(khach nay|khach hang nay|nguoi nay)\b/.test(folded);
    const refersToCurrentProduct = /\b(san pham nay|mat hang nay|thuoc nay)\b/.test(folded);
    const customerCode = originalCode || (
      refersToCurrentCustomer && contextRoute?.entityKey === 'customerId' ? contextCode : null
    );
    const productCode = originalCode || (
      refersToCurrentProduct && ['searchTerm', 'itemId'].includes(contextRoute?.entityKey) ? contextCode : null
    );

    if (/\bkhao sat 360\b/.test(folded)) {
      internalIntent = 'SURVEY_360';
      apiCode = '@khao_sat360';
      if (customerCode) entities.customerId = customerCode;
      else {
        missingFields = ['customerId'];
        responseKey = 'ASK_CUSTOMER_FOR_SURVEY';
      }
    } else if (/\b(danh sach )?cau hoi khao sat\b/.test(folded)) {
      internalIntent = 'SURVEY_QUESTIONS';
      apiCode = '@danh_sach_cau_hoi_khao_sat';
      if (customerCode) entities.customerId = customerCode;
      else {
        missingFields = ['customerId'];
        responseKey = 'ASK_CUSTOMER_FOR_SURVEY';
      }
    } else if (/\b(lich su khao sat|khao sat.*lich su)\b/.test(folded)) {
      internalIntent = 'SURVEY_HISTORY';
      apiCode = '@lich_su_khao_sat';
    } else if (/\b(hom nay.*khao sat|khao sat.*hom nay|kiem tra khao sat ngay)\b/.test(folded)) {
      internalIntent = 'SURVEY_DAILY_STATUS';
      apiCode = '@kiem_tra_khao_sat_ngay';
    } else if (/\b(trang thai khao sat|kiem tra khao sat)\b/.test(folded)) {
      internalIntent = 'SURVEY_STATUS';
      apiCode = '@kiem_tra_khao_sat';
      if (customerCode) entities.customerId = customerCode;
      else {
        missingFields = ['customerId'];
        responseKey = 'ASK_CUSTOMER_FOR_SURVEY';
      }
    } else if (/^(xem |coi |kiem tra )?cong no khach hang$/.test(folded)) {
      internalIntent = 'CUSTOMER_DEBT_SUMMARY';
      apiCode = '@cong_no_khach_hang';
    } else if (debtQuery) {
      internalIntent = 'CUSTOMER_DEBT_DETAIL';
      apiCode = '@cong_no_chi_tiet';
      if (customerCode) entities.customerId = customerCode;
      else {
        missingFields = ['customerId'];
        responseKey = 'ASK_CUSTOMER_FOR_DEBT';
      }
    } else if (inventoryQuery) {
      internalIntent = 'INVENTORY_LIST';
      apiCode = '@danh_sach_tonkho';
      if (productCode) entities.searchTerm = productCode;
      else {
        const match = normalized.originalText.match(/(?:tồn kho|ton kho)\s+(.+)$/i);
        const term = match ? match[1].trim() : '';
        if (term && !/^(còn bao nhiêu|bao nhiêu|giúp|nha|ạ)$/i.test(term)) entities.searchTerm = term;
        else {
          missingFields = ['searchTerm'];
          responseKey = 'ASK_PRODUCT_FOR_INVENTORY';
        }
      }
    } else if (upsellQuery) {
      internalIntent = 'UPSELL_RECOMMENDATION';
      apiCode = '@upsell_goi_y';
      if (customerCode) entities.customerId = customerCode;
      else {
        missingFields = ['customerId'];
        responseKey = 'ASK_CUSTOMER_FOR_UPSELL';
      }
    } else if (/\b(goi y don thuoc|don thuoc)\b/.test(folded)) {
      internalIntent = 'PRESCRIPTION_BUNDLE_RECOMMENDATION';
      apiCode = '@goi_ydon_thuoc';
      if (productCode) entities.searchTerm = productCode;
      else {
        missingFields = ['searchTerm'];
        responseKey = 'ASK_PRODUCT_FOR_PRESCRIPTION';
      }
    } else if (orderRecommendationQuery || sellTodayForCustomerQuery) {
      internalIntent = 'ORDER_RECOMMENDATION';
      apiCode = '@goi_ydon_hang';
      if (customerCode) entities.customerId = customerCode;
      else {
        missingFields = ['customerId'];
        responseKey = 'ASK_CUSTOMER_FOR_ORDER_RECOMMENDATION';
      }
    } else if (/\b(chi tiet hoa don)\b/.test(folded)) {
      internalIntent = 'INVOICE_DETAIL';
      apiCode = '@hoa_don_chi_tiet';
      if (originalCode) entities.documentId = originalCode;
      else {
        missingFields = ['documentId'];
        responseKey = 'ASK_DOCUMENT_FOR_INVOICE_DETAIL';
      }
    } else if (/\b(hoa don)\b/.test(folded)) {
      internalIntent = 'INVOICE_LIST';
      apiCode = '@hoa_don';
    } else if (/\b(don hang)\b/.test(folded)) {
      internalIntent = 'ORDER_LIST';
      apiCode = '@don_hang';
    } else if (/\b(cham diem khach hang|cham diem)\b/.test(folded)) {
      internalIntent = 'CUSTOMER_SCORING';
      apiCode = '@cham_diem_kh';
    } else if (/\b(tich luy)\b/.test(folded)) {
      internalIntent = 'LOYALTY_PROGRESS';
      apiCode = '@tich_luy';
      if (customerCode) entities.customerId = customerCode;
      else {
        missingFields = ['customerId'];
        responseKey = 'ASK_CUSTOMER_FOR_LOYALTY';
      }
    } else if (
      dailyWorkQuery
      || longAbsentCustomerQuery
      || /\b(tuyen ban hang|tuyen hom nay|lich tuyen)\b/.test(folded)
      || /\b(danh sach khach(?: hang)?.*tuyen|khach(?: hang)?.*(?:thuoc|trong).*tuyen|tuyen.*khach(?: hang)?)\b/.test(folded)
    ) {
      internalIntent = 'SALES_ROUTE';
      apiCode = '@tuyen_ban_hang';
      if (dailyWorkQuery) entities.topN = 8;
      if (longAbsentCustomerQuery) entities.absentDays = 30;
    } else if (/\b(san pham trong tam|hang trong tam)\b/.test(folded)) {
      internalIntent = 'FOCUS_PRODUCTS';
      apiCode = '@san_pham_trong_tam';
    } else if (/\b(de xuat khuyen mai|can khuyen mai|khuyen mai)\b/.test(folded)) {
      internalIntent = 'PROMOTION_REVIEW';
      apiCode = '@de_xuat_khuyen_mai';
    } else if (/\b(danh muc)\b/.test(folded)) {
      internalIntent = 'CATALOG_LOOKUP';
      apiCode = '@danh_muc';
      if (/\b(kho hang|kho)\b/.test(folded)) entities.catalogType = 'khohang';
      else if (/\b(khach hang|khach)\b/.test(folded)) entities.catalogType = 'khachhang';
      else if (/\b(san pham|hang hoa)\b/.test(folded)) entities.catalogType = 'sanpham';
    } else if (productInfoQuery) {
      internalIntent = 'PRODUCT_SEARCH';
      apiCode = '@tra_cuu_san_pham';
      if (productCode) entities.searchTerm = productCode;
      else {
        const match = normalized.originalText.match(/(?:sản phẩm|san pham|thuốc|thuoc)\s+(.+)$/i);
        const term = match ? match[1].trim() : '';
        if (term) entities.searchTerm = term;
        else {
          missingFields = ['searchTerm'];
          responseKey = 'ASK_PRODUCT_FOR_SEARCH';
        }
      }
    } else if (/\b(thong bao)\b/.test(folded)) {
      internalIntent = 'NOTIFICATIONS';
      apiCode = '@thong_bao';
    } else if (/\b(trieu chung)\b/.test(folded)) {
      internalIntent = 'SYMPTOM_PRODUCT_SEARCH';
      apiCode = '@tim_san_pham_theo_trieu_chung';
      const match = normalized.originalText.match(/(?:triệu chứng|trieu chung)\s+(.+)$/i);
      if (match && match[1].trim()) entities.keyword = match[1].trim();
    } else if (/\b(doanh so|doanh thu)\b/.test(folded)) {
      internalIntent = 'SALES_REVENUE';
      apiCode = '@doanh_so';
      const explicitDateRange = extractExplicitDateRange(normalized.originalText);
      if (explicitDateRange.mentioned && explicitDateRange.valid) {
        entities.fromDate = explicitDateRange.fromDate;
        entities.toDate = explicitDateRange.toDate;
      } else if (explicitDateRange.mentioned) {
        missingFields = ['dateRange'];
        responseKey = 'ASK_VALID_DATE_RANGE';
      } else if (/\bthang truoc\b/.test(folded)) {
        entities = { ...entities, ...resolveRelativeDateRange('LAST_MONTH', options.now) };
      } else if (/\btuan truoc\b/.test(folded)) {
        entities = { ...entities, ...resolveRelativeDateRange('LAST_WEEK', options.now) };
      }
    }

    return baseResult(normalized, {
      messageType: 'BUSINESS',
      intent: internalIntent,
      internalIntent,
      apiCode,
      confidence: internalIntent ? 0.97 : 0.82,
      entities,
      missingFields,
      requiresClarification: missingFields.length > 0 || !internalIntent,
      supported: Boolean(internalIntent),
      responseKey,
      responseMessage: responseKey ? RESPONSES[responseKey] : '',
    });
  }

  return baseResult(normalized, { confidence: 0.9 });
}

function getN8nRuntimeSource() {
  return [
    `const NATURAL_CHAT_SCHEMA_VERSION = ${JSON.stringify(SCHEMA_VERSION)};`,
    `const NATURAL_CHAT_RESPONSES = ${JSON.stringify(RESPONSES)};`,
    isErpCode.toString(),
    foldForMatch.toString(),
    normalizeNaturalText.toString(),
    extractErpCode.toString(),
    extractLastErpCode.toString(),
    getRecentUserMessages.toString(),
    inferContextRoute.toString(),
    toIsoLocalDate.toString(),
    resolveRelativeDateRange.toString(),
    parseExplicitDateToken.toString(),
    extractExplicitDateRange.toString(),
    baseResult.toString().replace(/SCHEMA_VERSION/g, 'NATURAL_CHAT_SCHEMA_VERSION').replace(/RESPONSES/g, 'NATURAL_CHAT_RESPONSES'),
    classifyNaturalMessage.toString().replace(/RESPONSES/g, 'NATURAL_CHAT_RESPONSES'),
  ].join('\n\n');
}

module.exports = {
  RESPONSES,
  classifyNaturalMessage,
  extractExplicitDateRange,
  foldForMatch,
  getN8nRuntimeSource,
  inferContextRoute,
  normalizeNaturalText,
  resolveRelativeDateRange,
};
