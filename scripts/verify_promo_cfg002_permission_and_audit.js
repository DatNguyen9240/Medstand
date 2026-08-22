'use strict';

/* PROMO-CFG-002 — kiểm chứng có assertion thật (throw khi sai, exit code != 0) cho phần
   "Cần làm" còn lại của backlog: quyền âm, khóa sửa bản đã duyệt, audit trước/sau + lý do,
   và config tương lai/hết hạn/sai scope bị AI_ActivePromotionByUserFnc loại đúng.
   Tất cả chạy trong 1 transaction luôn rollback ở cuối — không để lại dữ liệu test trên medtest. */
const fs = require('fs');
const sql = require('mssql');

function readEnv() {
  const values = {};
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) values[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function assert(condition, message) {
  if (!condition) throw new Error('ASSERTION_FAILED: ' + message);
}

async function upsert(tx, { username, promotionProgramID, promotionCode, effectiveFrom, effectiveTo, branchScopeMode, jsonBranchIDs, userGroupScopeMode, jsonUserGroupIDs, rules }) {
  return new sql.Request(tx)
    .input('PromotionProgramID', sql.BigInt, promotionProgramID || null)
    .input('PromotionCode', sql.VarChar(50), promotionCode)
    .input('PromotionName', sql.NVarChar(300), promotionCode)
    .input('ProgramType', sql.VarChar(20), 'EVENT')
    .input('EffectiveFrom', sql.DateTime2(0), effectiveFrom)
    .input('EffectiveTo', sql.DateTime2(0), effectiveTo)
    .input('BranchScopeMode', sql.VarChar(10), branchScopeMode || 'ALL')
    .input('JsonBranchIDs', sql.NVarChar(sql.MAX), JSON.stringify(jsonBranchIDs || []))
    .input('UserGroupScopeMode', sql.VarChar(10), userGroupScopeMode || 'ALL')
    .input('JsonUserGroupIDs', sql.NVarChar(sql.MAX), JSON.stringify(jsonUserGroupIDs || []))
    .input('SourceDocument', sql.NVarChar(500), 'verify_promo_cfg002_permission_and_audit.js')
    .input('JsonRules', sql.NVarChar(sql.MAX), JSON.stringify(rules))
    .input('Username', sql.VarChar(50), username)
    .input('Apply', sql.Bit, 1)
    .execute('dbo.API_PromotionProgram_Upsert_AI');
}

async function approve(tx, { username, promotionProgramID, action, reason }) {
  return new sql.Request(tx)
    .input('PromotionProgramID', sql.BigInt, promotionProgramID)
    .input('Action', sql.VarChar(20), action)
    .input('Reason', sql.NVarChar(500), reason === undefined ? null : reason)
    .input('Username', sql.VarChar(50), username)
    .input('Apply', sql.Bit, 1)
    .execute('dbo.API_PromotionProgram_Approve_AI');
}

async function activeByItems(tx, { username, itemIDs }) {
  return new sql.Request(tx)
    .input('Username', sql.VarChar(50), username)
    .input('JsonItemIDs', sql.NVarChar(sql.MAX), JSON.stringify(itemIDs))
    .execute('dbo.API_PromotionActiveByItems_AI');
}

async function lastAuditRow(tx, { targetEntity, targetID, actionType }) {
  const r = await new sql.Request(tx)
    .input('TargetEntity', sql.VarChar(100), targetEntity)
    .input('TargetID', sql.VarChar(100), targetID)
    .input('ActionType', sql.VarChar(100), actionType)
    .query(`
      SELECT TOP (1) * FROM dbo.AI_AuditLog
      WHERE TargetEntity = @TargetEntity AND TargetID = @TargetID AND ActionType = @ActionType
      ORDER BY LogID DESC;
    `);
  return r.recordset[0];
}

async function main() {
  const env = readEnv();
  if (String(env.TEST_DB_DATABASE || '').toLowerCase() !== 'medtest') throw new Error('medtest only');
  const pool = await sql.connect({
    server: env.TEST_DB_SERVER,
    port: Number(env.TEST_DB_PORT || 1433),
    database: env.TEST_DB_DATABASE,
    user: env.TEST_DB_USER,
    password: env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 60000,
  });

  const tx = new sql.Transaction(pool);
  await tx.begin();
  const results = [];
  try {
    const manager = (await new sql.Request(tx).query(`
      SELECT TOP (1) UserName, BranchID FROM dbo.SY_User
      WHERE COALESCE(Disable,0)=0 AND (COALESCE(Manager,0)=1 OR UPPER(COALESCE(UserGroupID,'')) IN ('QL','QLMN','ADMIN','SADM','BGD','GD'))
        AND COALESCE(BranchID, '') <> ''
      ORDER BY UserName;
    `)).recordset[0];
    const nonManager = (await new sql.Request(tx).query(`
      SELECT TOP (1) UserName FROM dbo.SY_User
      WHERE COALESCE(Disable,0)=0 AND COALESCE(Manager,0)=0
        AND UPPER(COALESCE(UserGroupID,'')) NOT IN ('QL','QLMN','ADMIN','SADM','BGD','GD')
      ORDER BY UserName;
    `)).recordset[0];
    const items = (await new sql.Request(tx).query(`SELECT TOP (4) ItemID FROM dbo.CF_ItemTbl WHERE COALESCE(isDisable,0)=0 ORDER BY ItemID;`)).recordset;
    assert(manager && manager.UserName, 'Không tìm thấy tài khoản quản lý có BranchID trong medtest để test.');
    assert(nonManager && nonManager.UserName, 'Không tìm thấy tài khoản không phải quản lý trong medtest để test quyền âm.');
    assert(items.length >= 4, 'Cần ít nhất 4 sản phẩm active trong medtest để test.');
    const [itemPerm, itemLock, itemFuture, itemExpired] = items.map((r) => r.ItemID);

    // Lấy 2 BranchID và 2 UserGroupID PHÂN BIỆT có thật trong medtest — không hardcode 'MB'/'MN'.
    const branchRows = (await new sql.Request(tx).query(`
      SELECT DISTINCT TOP (2) BranchID FROM dbo.SY_User WHERE COALESCE(BranchID,'') <> '' ORDER BY BranchID;
    `)).recordset;
    const userGroupRows = (await new sql.Request(tx).query(`
      SELECT DISTINCT TOP (2) UserGroupID FROM dbo.SY_User WHERE COALESCE(UserGroupID,'') <> '' ORDER BY UserGroupID;
    `)).recordset;
    assert(branchRows.length >= 2, 'Cần ít nhất 2 BranchID phân biệt trong medtest để test audit scope.');
    assert(userGroupRows.length >= 2, 'Cần ít nhất 2 UserGroupID phân biệt trong medtest để test audit scope.');
    const [branchA, branchB] = branchRows.map((r) => r.BranchID);
    const [userGroupA, userGroupB] = userGroupRows.map((r) => r.UserGroupID);

    // ── Test 1: quyền âm — tài khoản không phải quản lý KHÔNG được tạo CTBH ──
    const codePerm = 'VERIFY_PERM_' + Date.now();
    const upNonManager = await upsert(tx, {
      username: nonManager.UserName, promotionCode: codePerm,
      effectiveFrom: new Date(Date.now() - 60000), effectiveTo: new Date(Date.now() + 3600000),
      rules: [{ RuleOrder: 1, ItemID: itemPerm, RuleType: 'QUANTITY_DISCOUNT', MinimumQuantity: 1, DiscountPercent: 5 }],
    });
    assert(upNonManager.recordset[0].MsgType === 1,
      'Tài khoản không phải quản lý KHÔNG được tạo CTBH, thực tế: ' + JSON.stringify(upNonManager.recordset[0]));
    results.push(['NEGATIVE_PERMISSION_CREATE_BLOCKED', true]);

    // ── Test 2: quyền âm — tài khoản không phải quản lý KHÔNG được duyệt ──
    const upForApprove = await upsert(tx, {
      username: manager.UserName, promotionCode: codePerm,
      effectiveFrom: new Date(Date.now() - 60000), effectiveTo: new Date(Date.now() + 3600000),
      rules: [{ RuleOrder: 1, ItemID: itemPerm, RuleType: 'QUANTITY_DISCOUNT', MinimumQuantity: 1, DiscountPercent: 5 }],
    });
    const permProgramID = upForApprove.recordset[0].PromotionProgramID;
    const approveNonManager = await approve(tx, { username: nonManager.UserName, promotionProgramID: permProgramID, action: 'APPROVE' });
    assert(approveNonManager.recordset[0].MsgType === 1,
      'Tài khoản không phải quản lý KHÔNG được duyệt CTBH, thực tế: ' + JSON.stringify(approveNonManager.recordset[0]));
    results.push(['NEGATIVE_PERMISSION_APPROVE_BLOCKED', true]);

    // ── Test 3: audit trước/sau khi tạo version mới ──
    const auditCreate = await lastAuditRow(tx, { targetEntity: 'API_PromotionProgram_Upsert_AI', targetID: String(permProgramID), actionType: 'PROMOTION_CREATE_VERSION' });
    assert(auditCreate, 'Phải có dòng audit PROMOTION_CREATE_VERSION cho PromotionProgramID=' + permProgramID);
    const extraCreate = JSON.parse(auditCreate.ExtraInfo);
    assert(extraCreate.Before === null || extraCreate.Before === undefined, 'Tạo mới thì Before phải rỗng, thực tế: ' + auditCreate.ExtraInfo);
    assert(extraCreate.After && extraCreate.After.PromotionName === codePerm, 'After phải có PromotionName đúng, thực tế: ' + auditCreate.ExtraInfo);
    results.push(['AUDIT_CREATE_HAS_BEFORE_AFTER', true]);

    // ── Test 4: audit trước/sau khi sửa DRAFT hiện có ──
    await upsert(tx, {
      username: manager.UserName, promotionProgramID: permProgramID, promotionCode: codePerm,
      effectiveFrom: new Date(Date.now() - 60000), effectiveTo: new Date(Date.now() + 7200000),
      rules: [{ RuleOrder: 1, ItemID: itemPerm, RuleType: 'QUANTITY_DISCOUNT', MinimumQuantity: 2, DiscountPercent: 8 }],
    });
    const auditUpdate = await lastAuditRow(tx, { targetEntity: 'API_PromotionProgram_Upsert_AI', targetID: String(permProgramID), actionType: 'PROMOTION_UPDATE_DRAFT' });
    assert(auditUpdate, 'Phải có dòng audit PROMOTION_UPDATE_DRAFT khi sửa DRAFT.');
    const extraUpdate = JSON.parse(auditUpdate.ExtraInfo);
    assert(extraUpdate.Before && extraUpdate.Before.EffectiveTo, 'Sửa DRAFT thì Before phải có snapshot cũ, thực tế: ' + auditUpdate.ExtraInfo);
    assert(extraUpdate.After && extraUpdate.After.EffectiveTo !== extraUpdate.Before.EffectiveTo,
      'After phải khác Before sau khi đổi EffectiveTo, thực tế: ' + auditUpdate.ExtraInfo);
    results.push(['AUDIT_UPDATE_HAS_BEFORE_AFTER_DIFF', true]);

    // ── Test 4b: audit phải ghi ĐÚNG NỘI DUNG RULE, không chỉ RuleCount — sửa DRAFT lần 2
    //    giữ nguyên số rule (vẫn 1) nhưng đổi DiscountPercent 8 -> 15. Nếu audit chỉ so
    //    RuleCount thì Before/After sẽ giống hệt nhau và không phát hiện được thay đổi này. ──
    await upsert(tx, {
      username: manager.UserName, promotionProgramID: permProgramID, promotionCode: codePerm,
      effectiveFrom: new Date(Date.now() - 60000), effectiveTo: new Date(Date.now() + 7200000),
      rules: [{ RuleOrder: 1, ItemID: itemPerm, RuleType: 'QUANTITY_DISCOUNT', MinimumQuantity: 2, DiscountPercent: 15 }],
    });
    const auditRuleChange = await lastAuditRow(tx, { targetEntity: 'API_PromotionProgram_Upsert_AI', targetID: String(permProgramID), actionType: 'PROMOTION_UPDATE_DRAFT' });
    const extraRuleChange = JSON.parse(auditRuleChange.ExtraInfo);
    assert(Array.isArray(extraRuleChange.Before.Rules) && extraRuleChange.Before.Rules.length === 1 && extraRuleChange.Before.Rules[0].DiscountPercent === 8,
      'Before.Rules phải giữ nguyên DiscountPercent cũ (8), thực tế: ' + auditRuleChange.ExtraInfo);
    assert(Array.isArray(extraRuleChange.After.Rules) && extraRuleChange.After.Rules.length === 1 && extraRuleChange.After.Rules[0].DiscountPercent === 15,
      'After.Rules phải có DiscountPercent mới (15), thực tế: ' + auditRuleChange.ExtraInfo);
    assert(extraRuleChange.Before.RuleCount === extraRuleChange.After.RuleCount,
      'Test này cố tình giữ nguyên RuleCount để chứng minh audit không chỉ dựa vào RuleCount.');
    results.push(['AUDIT_CAPTURES_RULE_CONTENT_CHANGE', true]);

    // ── Test 4c: audit phải ghi ĐÚNG BranchIDs khi đổi phạm vi chi nhánh (branchA -> branchB) ──
    const codeBranchScope = 'VERIFY_BRANCH_SCOPE_' + Date.now();
    const upBranchScope = await upsert(tx, {
      username: manager.UserName, promotionCode: codeBranchScope,
      effectiveFrom: new Date(Date.now() - 60000), effectiveTo: new Date(Date.now() + 3600000),
      branchScopeMode: 'INCLUDE', jsonBranchIDs: [branchA],
      rules: [{ RuleOrder: 1, ItemID: itemPerm, RuleType: 'QUANTITY_DISCOUNT', MinimumQuantity: 1, DiscountPercent: 5 }],
    });
    const branchScopeProgramID = upBranchScope.recordset[0].PromotionProgramID;
    await upsert(tx, {
      username: manager.UserName, promotionProgramID: branchScopeProgramID, promotionCode: codeBranchScope,
      effectiveFrom: new Date(Date.now() - 60000), effectiveTo: new Date(Date.now() + 3600000),
      branchScopeMode: 'INCLUDE', jsonBranchIDs: [branchB],
      rules: [{ RuleOrder: 1, ItemID: itemPerm, RuleType: 'QUANTITY_DISCOUNT', MinimumQuantity: 1, DiscountPercent: 5 }],
    });
    const auditBranchScope = await lastAuditRow(tx, { targetEntity: 'API_PromotionProgram_Upsert_AI', targetID: String(branchScopeProgramID), actionType: 'PROMOTION_UPDATE_DRAFT' });
    assert(auditBranchScope, 'Phải có dòng audit PROMOTION_UPDATE_DRAFT cho ca đổi BranchIDs.');
    const extraBranchScope = JSON.parse(auditBranchScope.ExtraInfo);
    assert(extraBranchScope.Before.BranchIDs === branchA,
      'Before.BranchIDs phải là branch cũ (' + branchA + '), thực tế: ' + auditBranchScope.ExtraInfo);
    assert(extraBranchScope.After.BranchIDs === branchB,
      'After.BranchIDs phải là branch mới (' + branchB + '), thực tế: ' + auditBranchScope.ExtraInfo);
    results.push(['AUDIT_CAPTURES_BRANCH_SCOPE_CHANGE', true]);

    // ── Test 4d: audit phải ghi ĐÚNG UserGroupIDs khi đổi phạm vi nhóm quyền (userGroupA -> userGroupB) ──
    const codeGroupScope = 'VERIFY_GROUP_SCOPE_' + Date.now();
    const upGroupScope = await upsert(tx, {
      username: manager.UserName, promotionCode: codeGroupScope,
      effectiveFrom: new Date(Date.now() - 60000), effectiveTo: new Date(Date.now() + 3600000),
      userGroupScopeMode: 'INCLUDE', jsonUserGroupIDs: [userGroupA],
      rules: [{ RuleOrder: 1, ItemID: itemPerm, RuleType: 'QUANTITY_DISCOUNT', MinimumQuantity: 1, DiscountPercent: 5 }],
    });
    const groupScopeProgramID = upGroupScope.recordset[0].PromotionProgramID;
    await upsert(tx, {
      username: manager.UserName, promotionProgramID: groupScopeProgramID, promotionCode: codeGroupScope,
      effectiveFrom: new Date(Date.now() - 60000), effectiveTo: new Date(Date.now() + 3600000),
      userGroupScopeMode: 'INCLUDE', jsonUserGroupIDs: [userGroupB],
      rules: [{ RuleOrder: 1, ItemID: itemPerm, RuleType: 'QUANTITY_DISCOUNT', MinimumQuantity: 1, DiscountPercent: 5 }],
    });
    const auditGroupScope = await lastAuditRow(tx, { targetEntity: 'API_PromotionProgram_Upsert_AI', targetID: String(groupScopeProgramID), actionType: 'PROMOTION_UPDATE_DRAFT' });
    assert(auditGroupScope, 'Phải có dòng audit PROMOTION_UPDATE_DRAFT cho ca đổi UserGroupIDs.');
    const extraGroupScope = JSON.parse(auditGroupScope.ExtraInfo);
    assert(extraGroupScope.Before.UserGroupIDs === userGroupA,
      'Before.UserGroupIDs phải là nhóm cũ (' + userGroupA + '), thực tế: ' + auditGroupScope.ExtraInfo);
    assert(extraGroupScope.After.UserGroupIDs === userGroupB,
      'After.UserGroupIDs phải là nhóm mới (' + userGroupB + '), thực tế: ' + auditGroupScope.ExtraInfo);
    results.push(['AUDIT_CAPTURES_USER_GROUP_SCOPE_CHANGE', true]);

    // ── Test 5: REJECT/WITHDRAW bắt buộc lý do ──
    const rejectNoReason = await approve(tx, { username: manager.UserName, promotionProgramID: permProgramID, action: 'REJECT', reason: '' });
    assert(rejectNoReason.recordset[0].MsgType === 1,
      'REJECT không có lý do phải bị chặn, thực tế: ' + JSON.stringify(rejectNoReason.recordset[0]));
    results.push(['REJECT_REQUIRES_REASON', true]);

    const rejectWithReason = await approve(tx, { username: manager.UserName, promotionProgramID: permProgramID, action: 'REJECT', reason: 'Sai chiết khấu, cần tính lại theo bảng giá mới.' });
    assert(rejectWithReason.recordset[0].MsgType !== 1,
      'REJECT có lý do hợp lệ phải thành công, thực tế: ' + JSON.stringify(rejectWithReason.recordset[0]));
    const auditReject = await lastAuditRow(tx, { targetEntity: 'API_PromotionProgram_Approve_AI', targetID: String(permProgramID), actionType: 'PROMOTION_REJECT' });
    assert(auditReject, 'Phải có dòng audit PROMOTION_REJECT.');
    const extraReject = JSON.parse(auditReject.ExtraInfo);
    assert(extraReject.Reason === 'Sai chiết khấu, cần tính lại theo bảng giá mới.',
      'Audit REJECT phải lưu đúng lý do, thực tế: ' + auditReject.ExtraInfo);
    assert(extraReject.FromStatus === 'DRAFT' && extraReject.ToStatus === 'REJECTED',
      'Audit REJECT phải ghi đúng FromStatus/ToStatus, thực tế: ' + auditReject.ExtraInfo);
    results.push(['AUDIT_REJECT_HAS_REASON', true]);

    // ── Test 6: không được sửa trực tiếp bản đã duyệt (APPROVED), phải tạo version mới ──
    const codeLock = 'VERIFY_LOCK_' + Date.now();
    const upLock = await upsert(tx, {
      username: manager.UserName, promotionCode: codeLock,
      effectiveFrom: new Date(Date.now() - 60000), effectiveTo: new Date(Date.now() + 3600000),
      rules: [{ RuleOrder: 1, ItemID: itemLock, RuleType: 'QUANTITY_DISCOUNT', MinimumQuantity: 1, DiscountPercent: 5 }],
    });
    const lockProgramID = upLock.recordset[0].PromotionProgramID;
    const approveLock = await approve(tx, { username: manager.UserName, promotionProgramID: lockProgramID, action: 'APPROVE' });
    assert(approveLock.recordset[0].Status === 'APPROVED', 'Duyệt VERIFY_LOCK phải chuyển sang APPROVED.');
    const editApproved = await upsert(tx, {
      username: manager.UserName, promotionProgramID: lockProgramID, promotionCode: codeLock,
      effectiveFrom: new Date(Date.now() - 60000), effectiveTo: new Date(Date.now() + 3600000),
      rules: [{ RuleOrder: 1, ItemID: itemLock, RuleType: 'QUANTITY_DISCOUNT', MinimumQuantity: 1, DiscountPercent: 99 }],
    });
    assert(editApproved.recordset[0].MsgType === 1,
      'Sửa trực tiếp bản đã APPROVED phải bị chặn, thực tế: ' + JSON.stringify(editApproved.recordset[0]));
    results.push(['CANNOT_EDIT_APPROVED_DIRECTLY', true]);

    // ── Test 6b: WITHDRAW bắt buộc lý do (tái dùng lockProgramID đang APPROVED) ──
    const withdrawNoReason = await approve(tx, { username: manager.UserName, promotionProgramID: lockProgramID, action: 'WITHDRAW', reason: '' });
    assert(withdrawNoReason.recordset[0].MsgType === 1,
      'WITHDRAW không có lý do phải bị chặn, thực tế: ' + JSON.stringify(withdrawNoReason.recordset[0]));
    results.push(['WITHDRAW_REQUIRES_REASON', true]);

    const withdrawWithReason = await approve(tx, { username: manager.UserName, promotionProgramID: lockProgramID, action: 'WITHDRAW', reason: 'Phát hiện áp sai chi nhánh, thu hồi để cấu hình lại.' });
    assert(withdrawWithReason.recordset[0].MsgType !== 1 && withdrawWithReason.recordset[0].Status === 'WITHDRAWN',
      'WITHDRAW có lý do hợp lệ phải thành công và chuyển WITHDRAWN, thực tế: ' + JSON.stringify(withdrawWithReason.recordset[0]));
    const auditWithdraw = await lastAuditRow(tx, { targetEntity: 'API_PromotionProgram_Approve_AI', targetID: String(lockProgramID), actionType: 'PROMOTION_WITHDRAW' });
    assert(auditWithdraw, 'Phải có dòng audit PROMOTION_WITHDRAW.');
    const extraWithdraw = JSON.parse(auditWithdraw.ExtraInfo);
    assert(extraWithdraw.Reason === 'Phát hiện áp sai chi nhánh, thu hồi để cấu hình lại.',
      'Audit WITHDRAW phải lưu đúng lý do, thực tế: ' + auditWithdraw.ExtraInfo);
    assert(extraWithdraw.FromStatus === 'APPROVED' && extraWithdraw.ToStatus === 'WITHDRAWN',
      'Audit WITHDRAW phải ghi đúng FromStatus/ToStatus, thực tế: ' + auditWithdraw.ExtraInfo);
    results.push(['AUDIT_WITHDRAW_HAS_REASON', true]);

    // ── Test 7: config TƯƠNG LAI (EffectiveFrom > now) không được active ──
    const codeFuture = 'VERIFY_FUTURE_' + Date.now();
    const upFuture = await upsert(tx, {
      username: manager.UserName, promotionCode: codeFuture,
      effectiveFrom: new Date(Date.now() + 24 * 3600 * 1000), effectiveTo: new Date(Date.now() + 48 * 3600 * 1000),
      rules: [{ RuleOrder: 1, ItemID: itemFuture, RuleType: 'QUANTITY_DISCOUNT', MinimumQuantity: 1, DiscountPercent: 5 }],
    });
    await approve(tx, { username: manager.UserName, promotionProgramID: upFuture.recordset[0].PromotionProgramID, action: 'APPROVE' });
    const activeFuture = await activeByItems(tx, { username: manager.UserName, itemIDs: [itemFuture] });
    assert(!activeFuture.recordset.some((r) => r.PromotionCode === codeFuture),
      'CTBH có EffectiveFrom trong tương lai KHÔNG được xuất hiện trong ActiveByItems.');
    results.push(['FUTURE_DATED_EXCLUDED', true]);

    // ── Test 8: config HẾT HẠN (EffectiveTo <= now) không được active ──
    const codeExpired = 'VERIFY_EXPIRED_' + Date.now();
    const upExpired = await upsert(tx, {
      username: manager.UserName, promotionCode: codeExpired,
      effectiveFrom: new Date(Date.now() - 48 * 3600 * 1000), effectiveTo: new Date(Date.now() - 24 * 3600 * 1000),
      rules: [{ RuleOrder: 1, ItemID: itemExpired, RuleType: 'QUANTITY_DISCOUNT', MinimumQuantity: 1, DiscountPercent: 5 }],
    });
    await approve(tx, { username: manager.UserName, promotionProgramID: upExpired.recordset[0].PromotionProgramID, action: 'APPROVE' });
    const activeExpired = await activeByItems(tx, { username: manager.UserName, itemIDs: [itemExpired] });
    assert(!activeExpired.recordset.some((r) => r.PromotionCode === codeExpired),
      'CTBH đã hết hạn (EffectiveTo <= now) KHÔNG được xuất hiện trong ActiveByItems.');
    results.push(['EXPIRED_EXCLUDED', true]);

    // ── Test 9: SAI SCOPE (branch không khớp) bị loại; ĐÚNG SCOPE thì thấy được ──
    const codeScope = 'VERIFY_SCOPE_' + Date.now();
    const wrongBranch = manager.BranchID === 'ZZ_NOPE' ? 'YY_NOPE' : 'ZZ_NOPE';
    const upWrongScope = await upsert(tx, {
      username: manager.UserName, promotionCode: codeScope,
      effectiveFrom: new Date(Date.now() - 60000), effectiveTo: new Date(Date.now() + 3600000),
      branchScopeMode: 'INCLUDE', jsonBranchIDs: [wrongBranch],
      rules: [{ RuleOrder: 1, ItemID: itemPerm, RuleType: 'QUANTITY_DISCOUNT', MinimumQuantity: 1, DiscountPercent: 5 }],
    });
    await approve(tx, { username: manager.UserName, promotionProgramID: upWrongScope.recordset[0].PromotionProgramID, action: 'APPROVE' });
    const activeWrongScope = await activeByItems(tx, { username: manager.UserName, itemIDs: [itemPerm] });
    assert(!activeWrongScope.recordset.some((r) => r.PromotionCode === codeScope),
      'CTBH INCLUDE chi nhánh khác branch của user KHÔNG được xuất hiện, thực tế thấy: ' +
      JSON.stringify(activeWrongScope.recordset.filter((r) => r.PromotionCode === codeScope)));
    results.push(['WRONG_SCOPE_EXCLUDED', true]);

    const codeScopeOk = 'VERIFY_SCOPE_OK_' + Date.now();
    const upRightScope = await upsert(tx, {
      username: manager.UserName, promotionCode: codeScopeOk,
      effectiveFrom: new Date(Date.now() - 60000), effectiveTo: new Date(Date.now() + 3600000),
      branchScopeMode: 'INCLUDE', jsonBranchIDs: [manager.BranchID],
      rules: [{ RuleOrder: 1, ItemID: itemPerm, RuleType: 'QUANTITY_DISCOUNT', MinimumQuantity: 1, DiscountPercent: 5 }],
    });
    await approve(tx, { username: manager.UserName, promotionProgramID: upRightScope.recordset[0].PromotionProgramID, action: 'APPROVE' });
    const activeRightScope = await activeByItems(tx, { username: manager.UserName, itemIDs: [itemPerm] });
    assert(activeRightScope.recordset.some((r) => r.PromotionCode === codeScopeOk),
      'CTBH INCLUDE đúng branch của user PHẢI xuất hiện trong ActiveByItems.');
    results.push(['MATCHING_SCOPE_INCLUDED', true]);

    console.log(JSON.stringify({
      Task: 'VERIFY-PROMO-CFG-002-PERMISSION-AND-AUDIT', Status: 'PASS',
      Manager: manager.UserName, NonManager: nonManager.UserName, Results: results,
      GATEWAY_COVERAGE:
        'Script này chỉ kiểm SQL trong transaction rollback. Gateway spoofing được kiểm riêng bởi ' +
        'scripts/verify_promo_cfg002_gateway_identity.js qua HTTP runtime thật (read/write Apply=0).',
    }, null, 2));
  } finally {
    await tx.rollback();
    console.error('ROLLED_BACK (không để lại dữ liệu test)');
    await pool.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ Task: 'VERIFY-PROMO-CFG-002-PERMISSION-AND-AUDIT', Status: 'FAIL', Error: error.message }, null, 2));
  process.exitCode = 1;
});
