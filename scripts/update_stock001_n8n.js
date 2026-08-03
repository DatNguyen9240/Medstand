const fs = require('fs');

function readJson(path) {
  const raw = fs.readFileSync(path, 'utf8');
  const hasBom = raw.charCodeAt(0) === 0xfeff;
  return { raw, hasBom, json: JSON.parse(hasBom ? raw.slice(1) : raw) };
}

function replaceJsonStringProperty(raw, property, oldValue, newValue) {
  const propertyPattern = new RegExp(`"${property}"\\s*:\\s*`, 'g');
  let match;
  let matches = 0;
  let output = raw;
  let offset = 0;

  while ((match = propertyPattern.exec(raw)) !== null) {
    const valueStart = match.index + match[0].length;
    if (raw[valueStart] !== '"') continue;

    let escaped = false;
    let valueEnd = valueStart + 1;
    for (; valueEnd < raw.length; valueEnd += 1) {
      const ch = raw[valueEnd];
      if (!escaped && ch === '"') break;
      if (!escaped && ch === '\\') escaped = true;
      else escaped = false;
    }

    const encoded = raw.slice(valueStart, valueEnd + 1);
    let decoded;
    try { decoded = JSON.parse(encoded); } catch (_) { continue; }
    if (decoded !== oldValue) continue;

    const adjustedStart = valueStart + offset;
    const adjustedEnd = valueEnd + 1 + offset;
    const replacement = JSON.stringify(newValue);
    output = output.slice(0, adjustedStart) + replacement + output.slice(adjustedEnd);
    offset += replacement.length - encoded.length;
    matches += 1;
  }

  if (matches !== 1) {
    throw new Error(`Expected one ${property} value replacement, found ${matches}`);
  }
  return output;
}

function updateNodeProperty(path, nodeName, property, makeValue) {
  const source = readJson(path);
  const node = source.json.nodes.find((candidate) => candidate.name === nodeName);
  if (!node) throw new Error(`Node not found: ${nodeName}`);
  const oldValue = node.parameters[property];
  if (typeof oldValue !== 'string') throw new Error(`String property not found: ${nodeName}.${property}`);
  const newValue = makeValue(oldValue);
  const rawWithoutBom = source.hasBom ? source.raw.slice(1) : source.raw;
  const updated = replaceJsonStringProperty(rawWithoutBom, property, oldValue, newValue);
  // n8n CLI rejects UTF-8 BOM during import; normalize workflow sources to UTF-8 without BOM.
  fs.writeFileSync(path, updated, 'utf8');
}

const mainPath = 'n8n/AI_Core/MAIN_ChatBot_V5.json';
const executePath = 'n8n/API_Services/API_Execute.json';

const symptomStockQuery = `DECLARE @Username VARCHAR(50) = '{{ $('Parse User Info V5').first().json.userProfile.verifiedUserId.replace(/'/g, "''") }}';
DECLARE @StockAsOfUtc DATETIME2(0) = SYSUTCDATETIME();
DECLARE @BranchID VARCHAR(50) = '';

SELECT @BranchID = COALESCE(BranchID, '')
FROM dbo.SY_User
WHERE UserName = @Username AND COALESCE(Disable, 0) = 0;

SELECT
    I.ItemID,
    I.ItemName,
    I.Unit,
    CAST(P.UnitPrice AS DECIMAL(18, 2)) AS Price,
    S.PhysicalStock,
    S.ReservedStock,
    S.AvailableStock,
    S.StoreHouseID,
    S.StoreHouseName,
    S.WarehouseScope,
    S.StockDataStatus,
    S.StockUpdatedAt,
    S.StockAsOfAt,
    S.LatestStockMovementDate,
    S.StockDataSource,
    S.RuleVersion AS StockRuleVersion
FROM dbo.CF_ItemTbl I
CROSS APPLY
(
    SELECT TOP (1) Stock.*
    FROM dbo.AI_StockAvailableByUserFnc(@Username, I.ItemID, @StockAsOfUtc) Stock
    WHERE Stock.AvailableStock > 0
    ORDER BY Stock.AvailableStock DESC, Stock.StoreHouseID
) S
CROSS APPLY
(
    SELECT TOP (1) D.UnitPrice
    FROM dbo.AR_PriceDetailTbl D
    JOIN dbo.AR_PriceTbl H ON H.DocumentID = D.DocumentID
    WHERE D.ItemID = I.ItemID
      AND COALESCE(H.isDisable, 0) = 0
      AND D.UnitPrice > 0
    ORDER BY CASE WHEN H.FromDate <= GETDATE()
                       AND (H.ToDate IS NULL OR H.ToDate >= GETDATE()) THEN 0 ELSE 1 END,
             H.FromDate DESC
) P
WHERE COALESCE(I.isDisable, 0) = 0
  AND CASE WHEN @BranchID = 'MB' THEN COALESCE(I.IsDisableMB, 0)
           WHEN @BranchID = 'MN' THEN COALESCE(I.IsDisableMN, 0)
           WHEN @BranchID = 'MT' THEN COALESCE(I.IsDisableMT, 0)
           ELSE COALESCE(I.IsDisable, 0) END = 0
  AND EXISTS
  (
      SELECT 1
      FROM dbo.AI_BusinessRuleConfigTbl C
      CROSS APPLY STRING_SPLIT(C.ConfigValue, ',') V
      WHERE C.RuleCode = 'BR-STOCK-001'
        AND C.RuleVersion = S.RuleVersion
        AND C.ConfigKey = 'SellableItemGroupIDs'
        AND C.Status = 'APPROVED'
        AND UPPER(LTRIM(RTRIM(V.value))) = UPPER(COALESCE(I.ItemGroupID, ''))
  )
  AND I.ItemID IN ({{ $json.items.length > 0 ? $json.items.map(i => "'" + i.itemId.replace(/'/g, "''") + "'").join(',') : "''" }});`;

const symptomResponseCode = `const sqlResults = $input.all().map(item => item.json);
const symptomResult = $('Rerank & Threshold Symptom').first().json;
const qdrantResults = symptomResult.items || [];
const recognizedSymptoms = symptomResult.recognizedSymptoms || '';
const safetyWarning = 'Thông tin chỉ mang tính tham khảo, không thay thế tư vấn của bác sĩ hoặc dược sĩ. Chưa đủ dữ liệu để khẳng định sản phẩm an toàn hoặc phù hợp cho từng người dùng cụ thể.';

const sqlMap = {};
sqlResults.forEach((row) => {
  if (row.ItemID && Number(row.AvailableStock) > 0 && row.StoreHouseID && row.StockDataStatus === 'AVAILABLE_FOR_SALE') {
    sqlMap[String(row.ItemID).trim().toUpperCase()] = row;
  }
});

const sellableResults = qdrantResults.filter((item) => sqlMap[String(item.itemId || '').trim().toUpperCase()]);
const firstStock = sellableResults.length ? sqlMap[String(sellableResults[0].itemId).trim().toUpperCase()] : null;
const metadata = {
  ruleVersion: firstStock?.StockRuleVersion || null,
  source: firstStock?.StockDataSource ? 'QDRANT+' + firstStock.StockDataSource : 'QDRANT+SQL_STOCK',
  dataWindow: 'AS_OF_QUERY',
  updatedAt: firstStock?.StockAsOfAt || firstStock?.StockUpdatedAt || null,
  scope: firstStock?.WarehouseScope || null,
  freshness: firstStock?.StockDataStatus || 'NO_SELLABLE_STOCK'
};

if (sellableResults.length === 0) {
  return [{ json: { success: true, status: 'NO_DATA', code: 'NO_DATA', errorCode: null, contractVersion: '1.0.0-draft', metadata, message: 'Không tìm thấy sản phẩm liên quan còn tồn khả dụng, có giá bán và thuộc phạm vi kho của tài khoản. ' + safetyWarning, data: [], count: 0, ApiCode: '@tim_san_pham_theo_trieu_chung', apiCode: '@tim_san_pham_theo_trieu_chung' } }];
}

let replyText = 'Từ khóa/triệu chứng đã nhận diện: **' + (recognizedSymptoms || 'Chưa xác định rõ') + '**\\n\\nCác sản phẩm còn bán được để tham khảo:\\n\\n';
const dataPayload = [];

sellableResults.forEach((q, index) => {
  const sqlInfo = sqlMap[String(q.itemId).trim().toUpperCase()];
  const price = Number(sqlInfo.Price).toLocaleString('vi-VN') + 'đ';
  const stock = Number(sqlInfo.AvailableStock).toLocaleString('vi-VN') + ' ' + (sqlInfo.Unit || 'sản phẩm') + ' tại kho ' + sqlInfo.StoreHouseID;

  replyText += (index + 1) + '. **' + sqlInfo.ItemName + ' (Mã: ' + sqlInfo.ItemID + ')**\\n';
  replyText += '   - Giá bán: ' + price + '\\n';
  replyText += '   - Tồn khả dụng: ' + stock + '\\n';
  replyText += '   - Mức liên quan tìm kiếm: ' + (q.relevanceLevel || 'Cần xem xét thêm') + '\\n';
  if (q.matchReasons && q.matchReasons.length) replyText += '   - Căn cứ: ' + q.matchReasons.join('; ') + '\\n';
  if (q.ingredients) replyText += '   - Thành phần: ' + q.ingredients + '\\n';
  if (q.mainUses) replyText += '   - Công dụng: ' + q.mainUses + '\\n';
  if (q.usageInstructions) replyText += '   - Cách dùng: ' + q.usageInstructions + '\\n';
  replyText += '\\n';

  dataPayload.push({
    ItemID: sqlInfo.ItemID,
    ItemName: sqlInfo.ItemName,
    Unit: sqlInfo.Unit || 'sản phẩm',
    Price: Number(sqlInfo.Price),
    PhysicalStock: Number(sqlInfo.PhysicalStock),
    ReservedStock: Number(sqlInfo.ReservedStock),
    AvailableStock: Number(sqlInfo.AvailableStock),
    StoreHouseID: sqlInfo.StoreHouseID,
    StoreHouseName: sqlInfo.StoreHouseName,
    WarehouseScope: sqlInfo.WarehouseScope,
    StockDataStatus: sqlInfo.StockDataStatus,
    StockUpdatedAt: sqlInfo.StockUpdatedAt,
    StockAsOfAt: sqlInfo.StockAsOfAt,
    LatestStockMovementDate: sqlInfo.LatestStockMovementDate,
    StockDataSource: sqlInfo.StockDataSource,
    StockRuleVersion: sqlInfo.StockRuleVersion,
    Ingredients: q.ingredients,
    MainUses: q.mainUses,
    UsageInstructions: q.usageInstructions,
    RelevanceLevel: q.relevanceLevel,
    MatchReasons: q.matchReasons,
    RecognizedSymptoms: recognizedSymptoms,
    SafetyWarning: safetyWarning
  });
});

replyText += '> **Lưu ý:** ' + safetyWarning + '\\n\\n';
replyText += '<suggest>' + sellableResults.slice(0, 3).map(q => 'Sản phẩm ' + q.itemName).join(' | ') + '</suggest>';

return [{
  json: {
    success: true,
    status: 'SUCCESS',
    code: 'OK',
    errorCode: null,
    contractVersion: '1.0.0-draft',
    metadata,
    message: replyText,
    data: dataPayload,
    count: dataPayload.length,
    ApiCode: '@tim_san_pham_theo_trieu_chung',
    apiCode: '@tim_san_pham_theo_trieu_chung',
    recognizedSymptoms,
    safetyWarning
  }
}];`;

updateNodeProperty(mainPath, 'SQL Stock & Price Symptom', 'query', () => symptomStockQuery);
updateNodeProperty(mainPath, 'Generate Symptom Response', 'jsCode', () => symptomResponseCode);

updateNodeProperty(executePath, 'Format Execute Response', 'jsCode', (code) => {
  const oldBlock = `const dataRows = apiCode().toLowerCase() === '@tim_san_pham_theo_trieu_chung'
  ? rawDataRows.map((row) => ({
      ...row,
      PhysicalStock: null,
      AvailableStock: null,
      StockDataStatus: row.StockDataStatus || 'PHYSICAL_STOCK_NOT_QUERIED',
      RecommendationStatus: row.RecommendationStatus || 'REFERENCE_ONLY_MEDICAL_REVIEW_REQUIRED',
      MedicalDisclaimer: row.MedicalDisclaimer || 'Thông tin chỉ để tham khảo; không thay thế chẩn đoán, kê đơn hoặc tư vấn của người có chuyên môn.',
      RuleVersion: row.RuleVersion || 'BR-MED-V1-DRAFT'
    }))
  : rawDataRows;`;
  const newBlock = `const dataRows = apiCode().toLowerCase() === '@tim_san_pham_theo_trieu_chung'
  ? rawDataRows
      .filter((row) => Number(row.AvailableStock) > 0 && row.StoreHouseID && row.StockDataStatus === 'AVAILABLE_FOR_SALE')
      .map((row) => ({
        ...row,
        RecommendationStatus: row.RecommendationStatus || 'REFERENCE_ONLY_MEDICAL_REVIEW_REQUIRED',
        MedicalDisclaimer: row.MedicalDisclaimer || 'Thông tin chỉ để tham khảo; không thay thế chẩn đoán, kê đơn hoặc tư vấn của người có chuyên môn.',
        RuleVersion: row.RuleVersion || 'BR-MED-V1-DRAFT'
      }))
  : rawDataRows;`;
  if (code.includes(newBlock)) return code;
  if (!code.includes(oldBlock)) throw new Error('API_Execute stock override block did not match');
  return code.replace(oldBlock, newBlock);
});

console.log('Updated STOCK-001 nodes in MAIN_ChatBot_V5 and API_Execute.');
