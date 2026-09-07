'use strict';

/* SEARCH-005 (n8n layer) — khối "GLOBAL SMART CUSTOMER RESOLUTION" trong node
   "Build Execute SQL" của n8n/API_Services/API_Execute.json hiện luôn TOP 1
   bất kể có bao nhiêu khách khớp, RỒI GHI ĐÈ @MaKhachHang/@ObjectID bằng ID đã
   đoán TRƯỚC KHI gọi stored procedure. Vì @MaKhachHang lúc đó đã là một
   ObjectID thật, guard "NOT EXISTS(...WHERE ObjectID=@MaKhachHang)" bên trong
   8 SP vừa sửa (SEARCH-005 ở tầng SQL) không còn đúng — SP tưởng đây là ID có
   sẵn, bỏ qua toàn bộ bước đếm-ambiguity của chính nó. Nói cách khác: sửa 8 SP
   mà không sửa khối này thì n8n vẫn xuyên qua fix, đường tắt "tự lấy dòng đầu"
   coi như còn nguyên khi gọi qua AI/chatbot.

   Cách sửa: đếm số khớp trước. Đúng 1 thì thay ID như cũ (không đổi hành vi
   ca phổ biến). 0 hoặc >1 thì KHÔNG đụng @ParamsJSON — để nguyên chuỗi gốc,
   giao lại cho chính stored procedure đích tự quyết định (NO_MATCH hoặc
   NEEDS_SELECTION) bằng logic ambiguity-aware nó đã có. Không cần phát hành
   selection token ở tầng này: NEEDS_SELECTION trả từ SP đã đủ để frontend xử lý
   (xem Phase 4 trong kế hoạch).

   Dùng regex khoan dung khoảng trắng thay vì so khớp chuỗi tuyệt đối, vì
   console.log khi khảo sát có thể không phản chiếu đúng byte gốc (dấu cách
   cuối dòng, v.v.). */
const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '..', 'n8n', 'API_Services', 'API_Execute.json');
const wf = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const node = wf.nodes.find((n) => n.name === 'Build Execute SQL');
if (!node) throw new Error('Node not found: Build Execute SQL');

const before = node.parameters.jsCode;

// Khoan dung khoảng trắng: mọi chuỗi khoảng trắng liên tiếp trong pattern khớp
// với MỘT hoặc NHIỀU khoảng trắng bất kỳ trong nguồn thật.
function looseWhitespaceRegex(literal) {
  const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped.replace(/\s+/g, '\\s+'));
}

const anchorPattern = looseWhitespaceRegex(
  `DECLARE @ResolvedID VARCHAR(50) = ''
    DECLARE @CleanSearch NVARCHAR(100) = dbo.ufn_clean_customer_name(@MaKhachHang)

    SELECT TOP 1 @ResolvedID = ObjectID
    FROM dbo.CF_ObjectTbl
    WHERE (dbo.ufn_clean_customer_name(ObjectName) LIKE '%' + @CleanSearch + '%'
       OR ObjectID LIKE '%' + @CleanSearch + '%')
       AND (@Username = '' OR ObjectID IN (SELECT ObjectID FROM dbo.AR_GetObjectByUserFnc(@Username)))
    ORDER BY
        CASE WHEN ObjectID = @CleanSearch THEN 1
             WHEN dbo.ufn_clean_customer_name(ObjectName) = @CleanSearch THEN 2
             WHEN dbo.ufn_clean_customer_name(ObjectName) LIKE @CleanSearch + '%' THEN 3
             ELSE 4
        END,
        COALESCE((SELECT MAX(DocumentDate) FROM AR_InvoiceTbl WHERE ObjectID = CF_ObjectTbl.ObjectID), '1900-01-01') DESC,
        LEN(ObjectName) ASC;

    IF @ResolvedID <> ''
    BEGIN
        SET @ParamsJSON = JSON_MODIFY(@ParamsJSON, '$."@MaKhachHang"', @ResolvedID);
        SET @ParamsJSON = JSON_MODIFY(@ParamsJSON, '$."@ObjectID"', @ResolvedID);
    END
END`
);

const match = anchorPattern.exec(before);
if (!match) throw new Error('anchorPattern not found in Build Execute SQL jsCode');

const newBlock = `DECLARE @ResolvedID VARCHAR(50) = ''
    DECLARE @CleanSearch NVARCHAR(100) = dbo.ufn_clean_customer_name(@MaKhachHang)
    -- SEARCH-005 (n8n): đếm khớp trước, không tự lấy TOP 1 khi có NHIỀU khách
    -- cùng khớp. Chỉ ghi đè @ParamsJSON khi đúng 1 khách — nếu không, để
    -- nguyên tên gốc và giao lại cho stored procedure đích (đã có ambiguity
    -- guard riêng) tự trả NO_MATCH/NEEDS_SELECTION thay vì đoán ở đây.
    DECLARE @MatchCount INT
    SELECT @MatchCount = COUNT(DISTINCT ObjectID)
    FROM dbo.CF_ObjectTbl
    WHERE (dbo.ufn_clean_customer_name(ObjectName) LIKE '%' + @CleanSearch + '%'
       OR ObjectID LIKE '%' + @CleanSearch + '%')
       AND (@Username = '' OR ObjectID IN (SELECT ObjectID FROM dbo.AR_GetObjectByUserFnc(@Username)))

    IF @MatchCount = 1
    BEGIN
        SELECT TOP 1 @ResolvedID = ObjectID
        FROM dbo.CF_ObjectTbl
        WHERE (dbo.ufn_clean_customer_name(ObjectName) LIKE '%' + @CleanSearch + '%'
           OR ObjectID LIKE '%' + @CleanSearch + '%')
           AND (@Username = '' OR ObjectID IN (SELECT ObjectID FROM dbo.AR_GetObjectByUserFnc(@Username)))
        ORDER BY
            CASE WHEN ObjectID = @CleanSearch THEN 1
                 WHEN dbo.ufn_clean_customer_name(ObjectName) = @CleanSearch THEN 2
                 WHEN dbo.ufn_clean_customer_name(ObjectName) LIKE @CleanSearch + '%' THEN 3
                 ELSE 4
            END,
            COALESCE((SELECT MAX(DocumentDate) FROM AR_InvoiceTbl WHERE ObjectID = CF_ObjectTbl.ObjectID), '1900-01-01') DESC,
            LEN(ObjectName) ASC;

        IF @ResolvedID <> ''
        BEGIN
            SET @ParamsJSON = JSON_MODIFY(@ParamsJSON, '$."@MaKhachHang"', @ResolvedID);
            SET @ParamsJSON = JSON_MODIFY(@ParamsJSON, '$."@ObjectID"', @ResolvedID);
        END
    END
END`;

const after = before.slice(0, match.index) + newBlock + before.slice(match.index + match[0].length);
if (after === before) throw new Error('Replacement produced no change');

node.parameters.jsCode = after;

fs.writeFileSync(FILE, JSON.stringify(wf, null, 2) + '\n', 'utf8');
console.log('Patched', FILE);
