import { test, expect } from '@playwright/test';
import { attachJson, openChatbot, postWebhook, responseList, roleToken, writeReport } from './helpers';

const HIDDEN_COMMANDS = [
  '@cap_nhat_ket_qua_khao_sat',
  '@khach_hang_insert',
  '@lap_don_hang',
  '@san_pham_trong_tam_import',
];

const SAFE_PARAMS: Record<string, Record<string, unknown>> = {
  '@cham_diem_kh': { '@MaKhachHang': '__P2_NO_DATA__' },
  '@cong_no_chi_tiet': { '@MaKhachHang': '__P2_NO_DATA__', '@DenNgay': '2000-01-01' },
  '@cong_no_khach_hang': { '@MaKhachHang': '__P2_NO_DATA__', '@DenNgay': '2000-01-01' },
  '@danh_muc': { '@Type': 'khachhang', '@timkiem': '__P2_NO_DATA__' },
  '@danh_sach_cau_hoi_khao_sat': { '@MaKhachHang': '__P2_NO_DATA__' },
  '@danh_sach_tonkho': { '@timkiem': '__P2_NO_DATA__' },
  '@de_xuat_khuyen_mai': {},
  '@doanh_so': { '@TuNgay': '2000-01-01', '@DenNgay': '2000-01-01', '@MaKhachHang': '__P2_NO_DATA__' },
  '@don_hang': { '@timkiem': '__P2_NO_DATA__', '@TopN': 1 },
  '@goi_ydon_hang': { '@MaKhachHang': '__P2_NO_DATA__', '@TopN': 1 },
  '@goi_ydon_thuoc': { '@timkiem': '__P2_NO_DATA__' },
  '@hoa_don': { '@TuNgay': '2000-01-01', '@DenNgay': '2000-01-01', '@timkiem': '__P2_NO_DATA__' },
  '@hoa_don_chi_tiet': { '@DocumentID': '__P2_NO_DATA__' },
  '@khao_sat360': { '@ObjectID': '__P2_NO_DATA__', '@FromDate': '2000-01-01', '@ToDate': '2000-01-01' },
  '@kiem_tra_khao_sat': { '@Ngay': '2000-01-01' },
  '@kiem_tra_khao_sat_ngay': { '@Ngay': '2000-01-01' },
  '@lich_su_khao_sat': { '@FromDate': '2000-01-01', '@ToDate': '2000-01-01' },
  '@san_pham_trong_tam': { '@MaKhachHang': '__P2_NO_DATA__', '@TopN': 1 },
  '@thong_bao': {},
  '@tich_luy': { '@MaKhachHang': '__P2_NO_DATA__' },
  '@tim_san_pham_theo_trieu_chung': { '@Keyword': '__P2_NO_DATA__' },
  '@tra_cuu_san_pham': { '@timkiem': '__P2_NO_DATA__', '@TopN': 1 },
  '@tuyen_ban_hang': { '@MaKhachHang': '__P2_NO_DATA__', '@TopN': 1 },
  '@upsell_goi_y': { '@MaKhachHang': '__P2_NO_DATA__', '@timkiem': '__P2_NO_DATA__', '@TopN': 1 },
};

function assertEnvelope(body: any, apiCode: string) {
  expect(body.requestId, `${apiCode} requestId`).toMatch(/^req-/);
  expect(typeof body.success, `${apiCode} success`).toBe('boolean');
  expect(typeof body.code, `${apiCode} code`).toBe('string');
  expect(Number.isInteger(body.count), `${apiCode} count`).toBe(true);
  expect(Array.isArray(body.data), `${apiCode} data`).toBe(true);
  expect(body.count, `${apiCode} count/data`).toBe(body.data.length);
  expect(body.StoredProcedure, `${apiCode} procedure leak`).toBeUndefined();
  expect(body.DataSourceValue, `${apiCode} datasource leak`).toBeUndefined();
}

test('@chatbot 24 role-visible read commands execute safely and have a renderer', async ({ page, request }, testInfo) => {
  test.setTimeout(600_000);
  const token = roleToken(testInfo.project.name);
  const catalogResponse = await postWebhook(request, 'api-list-active', token, {});
  expect(catalogResponse.status()).toBe(200);
  const catalogBody = await catalogResponse.json();
  const list = responseList(catalogBody);
  expect(list).toHaveLength(24);
  const codes = list.map(item => String(item.ApiCode));
  for (const hidden of HIDDEN_COMMANDS) expect(codes).not.toContain(hidden);
  const onlyApi = String(process.env.P2_ONLY_API || '').trim();
  const executionList = onlyApi ? list.filter(item => String(item.ApiCode) === onlyApi) : list;
  expect(executionList.length, `P2_ONLY_API ${onlyApi}`).toBeGreaterThan(0);

  await openChatbot(page);
  const matrix = [];
  const reportName = `p2-01-${testInfo.project.name}-execute-renderer-matrix.json`;
  for (const item of executionList) {
    const apiCode = String(item.ApiCode);
    const executionResponse = await postWebhook(request, 'api-execute', token, {
      ApiCode: apiCode,
      params: SAFE_PARAMS[apiCode] || {},
    });
    const execution = await executionResponse.json();
    expect([200, 422], `${apiCode} execution status; code=${execution.code}`).toContain(executionResponse.status());
    assertEnvelope(execution, apiCode);

    const renderer = await page.evaluate(({ code, template }) => {
      const apiChatbot = (window as any).ApiChatbot;
      const apiEngine = (window as any).ApiEngine;
      const resolved = String(template || apiEngine.getUiTemplate(code) || 'DEFAULT').toUpperCase();
      const html = apiChatbot.__internal.renderCardView(
        [{ Code: 'P2-SYNTHETIC', Name: 'P2 renderer proof', Value: 1 }],
        'P2 renderer proof',
        code,
        { uiTemplate: resolved, fieldRoles: {} },
      );
      return { uiTemplate: resolved, rendered: typeof html === 'string' && html.length > 0 };
    }, { code: apiCode, template: item.UiTemplate });
    expect(renderer.rendered, `${apiCode} renderer`).toBe(true);

    matrix.push({
      ApiCode: apiCode,
      UiTemplate: renderer.uiTemplate,
      execution: {
        httpStatus: executionResponse.status(), code: execution.code,
        count: execution.count, requestId: execution.requestId,
      },
      renderer: 'PASS',
      result: 'PASS',
    });
    writeReport(reportName, {
      role: testInfo.project.name,
      expectedRoleVisibleReadCommands: 24,
      excludedByPolicy: HIDDEN_COMMANDS,
      complete: false,
      passed: matrix.length,
      failed: 0,
      matrix,
    });
  }

  const report = {
    role: testInfo.project.name,
    expectedRoleVisibleReadCommands: onlyApi ? 1 : 24,
    excludedByPolicy: HIDDEN_COMMANDS,
    catalogRequestId: catalogBody.requestId || catalogResponse.headers()['x-request-id'] || null,
    complete: true,
    passed: matrix.length,
    failed: 0,
    matrix,
  };
  writeReport(reportName, report);
  await attachJson(testInfo, `p2-01-${testInfo.project.name}-execute-renderer-matrix`, report);
});
