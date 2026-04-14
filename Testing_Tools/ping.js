const url = "http://127.0.0.1:5678/webhook/hook-ai-dainao";
const payload = { action: 'chat', text: 'Hôm nay bán gì cho nhà thuốc Phúc Khang?', session_id: 'test' };

fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
})
.then(res => res.text())
.then(text => console.log("RESPONSE:", text))
.catch(err => console.error("ERROR:", err));
