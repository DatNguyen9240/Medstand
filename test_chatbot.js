async function run() {
    try {
        const payload = {
            action: 'chat',
            text: 'Kiểm tra tồn kho của Antrinano',
            session_id: 'test_verification_session',
            files: [],
            history: ''
        };
        const response = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer SIMULATED_SALES_TOKEN_LOCAL'
            },
            body: JSON.stringify(payload)
        });
        const status = response.status;
        const text = await response.text();
        console.log(`[VERIFICATION] Status: ${status}`);
        console.log(`[VERIFICATION] Response: ${text.substring(0, 300)}`);
    } catch (e) {
        console.error('[VERIFICATION] Error:', e.message);
    }
}
run();
