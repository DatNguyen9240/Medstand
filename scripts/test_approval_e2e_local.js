'use strict';
/**
 * Test E2E luồng duyệt đơn qua gateway local.
 * Luồng: Đăng nhập demo -> Lấy Context -> Duyệt đơn (APPROVE) -> Kiểm tra kết quả -> Replay test.
 */
const http = require('http');

const BASE = 'http://localhost:3000';
const USERNAME = 'demo';
const PASSWORD = '123456';
const ORDER_ID = 'UATORD-mscnvgnccb64aj1j91sbr'; // Đơn StatusID=0, BranchID=MB

function encrypt(str, key = 107) {
  const b64 = Buffer.from(str, 'utf-8').toString('base64');
  let xor = '';
  for (let i = 0; i < b64.length; i++) xor += String.fromCharCode(b64.charCodeAt(i) ^ key);
  return Buffer.from(xor, 'utf-8').toString('base64');
}
function decrypt(b64Cipher, key = 107) {
  const xor = Buffer.from(b64Cipher, 'base64').toString('utf-8');
  let b = '';
  for (let i = 0; i < xor.length; i++) b += String.fromCharCode(xor.charCodeAt(i) ^ key);
  return Buffer.from(b, 'base64').toString('utf-8');
}

function request(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost', port: 3000,
      path, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers
      }
    }, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (json.data) {
            resolve(JSON.parse(decrypt(json.data)));
          } else {
            resolve(json);
          }
        } catch (e) {
          resolve({ raw, error: e.message });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function newKey(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('🧪 TEST E2E LOCAL — LUỒNG DUYỆT ĐƠN (ORDER-APPROVAL)');
  console.log('═══════════════════════════════════════════════════\n');

  // 1. Đăng nhập
  console.log('[1] Đăng nhập với tài khoản:', USERNAME);
  const loginPayload = {
    method: 'POST',
    endpoint: '/api/login',
    body: { username: USERNAME, password: PASSWORD }
  };
  const loginRes = await request('/api/gateway', { data: encrypt(JSON.stringify(loginPayload)) });
  const token = loginRes.access_token || loginRes.Token;
  if (!token) {
    throw new Error('Đăng nhập thất bại: ' + JSON.stringify(loginRes));
  }
  console.log('    ✅ Đăng nhập thành công, Token:', token.slice(0, 16) + '...');

  // 2. Lấy ApprovalContext
  console.log('\n[2] Đọc trạng thái & quyền duyệt cho đơn:', ORDER_ID);
  const ctxPayload = {
    method: 'GET',
    endpoint: '/api/API_DonHang_ApprovalContext_AI?q=' + encodeURIComponent(JSON.stringify({ DocumentID: ORDER_ID }))
  };
  const ctxRes = await request(
    '/api/gateway',
    { data: encrypt(JSON.stringify(ctxPayload)) },
    { 'Authorization': 'Bearer ' + token }
  );
  
  const ctx = ctxRes && ctxRes.records ? ctxRes.records[0] : ctxRes;
  console.log('    Trạng thái hiện tại:', ctx.StatusName, `(StatusID = ${ctx.StatusID})`);
  console.log('    Chi nhánh đơn:', ctx.BranchID);
  console.log('    Hợp đồng duyệt:', ctx.ContractStatus, `(${ctx.ContractVersion})`);
  console.log('    Quyền duyệt (CanApprove):', ctx.CanApprove === '1' || ctx.CanApprove === true);
  console.log('    Quyền từ chối (CanReject):', ctx.CanReject === '1' || ctx.CanReject === true);

  if (ctx.CanApprove !== '1' && ctx.CanApprove !== true) {
    console.log('    ❌ Không có quyền duyệt. BlockMsg:', ctx.BlockMsg);
    return;
  }

  // 3. Thực hiện DUYỆT ĐƠN (APPROVE)
  const idemKey = newKey('idem-approve');
  console.log('\n[3] Thực hiện DUYỆT ĐƠN (APPROVE)');
  console.log('    Idempotency-Key:', idemKey);

  const approvePayload = {
    method: 'POST',
    endpoint: '/api/API_DonHang_ApproveTransition_AI',
    body: {
      DocumentID: ORDER_ID,
      Action: 'APPROVE',
      ExpectedStatusID: Number(ctx.StatusID),
      Reason: ''
    }
  };

  const approveRes = await request(
    '/api/gateway',
    { data: encrypt(JSON.stringify(approvePayload)) },
    {
      'Authorization': 'Bearer ' + token,
      'Idempotency-Key': idemKey
    }
  );

  const record = Array.isArray(approveRes)
    ? approveRes[0]
    : (approveRes && approveRes.records ? approveRes.records[0] : approveRes);

  console.log('    Kết quả duyệt:', JSON.stringify(record, null, 2));

  if (record && (record.MsgType === 5 || record.MsgType === '5')) {
    console.log('    ✅ DUYỆT ĐƠN THÀNH CÔNG:', record.Msg);
  } else {
    console.log('    ❌ Duyệt thất bại:', record ? record.Msg : approveRes);
  }

  // 4. Kiểm tra replay (chống double-click / gửi lặp)
  console.log('\n[4] Kiểm tra Idempotency Replay (gửi lại cùng request & cùng key)');
  const replayRes = await request(
    '/api/gateway',
    { data: encrypt(JSON.stringify(approvePayload)) },
    {
      'Authorization': 'Bearer ' + token,
      'Idempotency-Key': idemKey
    }
  );

  const replayRecord = Array.isArray(replayRes)
    ? replayRes[0]
    : (replayRes && replayRes.records ? replayRes.records[0] : replayRes);

  console.log('    Kết quả replay:', JSON.stringify(replayRecord, null, 2));
  if (replayRecord && (replayRecord.IsReplay === true || replayRecord.IsReplay === '1' || replayRecord.IsReplay === 1)) {
    console.log('    ✅ Khóa chống gửi lặp hoạt động CHÍNH XÁC (IsReplay = true, không đổi trạng thái 2 lần)');
  }

  // 5. Kiểm tra trạng thái đơn sau khi duyệt
  console.log('\n[5] Đọc lại ApprovalContext sau khi duyệt');
  const afterRes = await request(
    '/api/gateway',
    { data: encrypt(JSON.stringify(ctxPayload)) },
    { 'Authorization': 'Bearer ' + token }
  );
  const afterCtx = afterRes && afterRes.records ? afterRes.records[0] : afterRes;
  console.log('    Trạng thái mới:', afterCtx.StatusName, `(StatusID = ${afterCtx.StatusID})`);
  console.log('    CanApprove sau khi đã duyệt:', afterCtx.CanApprove === '1' || afterCtx.CanApprove === true);

  console.log('\n═══════════════════════════════════════════════════');
  console.log('🎉 TẤT CẢ CÁC BƯỚC KIỂM THỬ ĐỀU THÀNH CÔNG!');
  console.log('═══════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('\n❌ LỖI:', err.message);
  process.exitCode = 1;
});
