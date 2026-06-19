// Native fetch is available globally

async function test() {
    const apiBase = 'https://medtest.bms79.com';
    
    // Log in
    console.log("Logging in...");
    const loginRes = await fetch(`${apiBase}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ UserName: 'NAMDINHB.MED', Password: '123456' })
    });
    
    if (!loginRes.ok) {
        console.error("Login failed:", loginRes.status, await loginRes.text());
        return;
    }
    
    const loginData = await loginRes.json();
    const token = loginData.token || loginData.data?.token || loginData.AccessToken || (loginRes.headers.get('set-cookie') || '').match(/auth_token=([^;]*)/)?.[1];
    
    console.log("Login success. Token length:", token ? token.length : 0);
    console.log("Response data:", JSON.stringify(loginData));
    
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
    
    // Get Informations
    const fromDate = '2026-06-01';
    const toDate = '2026-06-15';
    const infoUrl = `${apiBase}/api/API_Dashboard_ThongTin?q=` + encodeURIComponent(JSON.stringify({ FromDate: fromDate, ToDate: toDate }));
    console.log("Fetching Info from:", infoUrl);
    const infoRes = await fetch(infoUrl, { headers });
    console.log("Info Status:", infoRes.status);
    console.log("Info Body:", await infoRes.text());
    
    // Get Birthdays
    const bdUrl = `${apiBase}/api/API_Dashboard_SinhNhat?q=` + encodeURIComponent(JSON.stringify({ FromDate: fromDate, ToDate: toDate, User: 'demo' }));
    console.log("Fetching Birthdays from:", bdUrl);
    const bdRes = await fetch(bdUrl, { headers });
    console.log("Birthdays Status:", bdRes.status);
    console.log("Birthdays Body:", await bdRes.text());

    // Get Revenue
    const revUrl = `${apiBase}/api/API_DoanhSo_AI?q=` + encodeURIComponent(JSON.stringify({ FromDate: fromDate, ToDate: toDate }));
    console.log("Fetching Revenue from:", revUrl);
    const revRes = await fetch(revUrl, { headers });
    console.log("Revenue Status:", revRes.status);
    console.log("Revenue Body:", await revRes.text());
}

test().catch(err => console.error(err));
