fetch('http://127.0.0.1:5678/webhook/api-datasource', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ DataSourceType: 'APICODE', DataSourceValue: '@danh_muc|@Type=donhang', SearchKey: '' }) })
.then(r=>r.text())
.then(txt => console.log("LENGTH:", txt.length, "TEXT:", txt));
