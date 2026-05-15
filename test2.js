const http = require('http');
const data = JSON.stringify({ ApiCode: '@cong_no_khach_hang', params: {} });
const options = {
  hostname: '127.0.0.1',
  port: 5678,
  path: '/webhook/api-execute',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};
const req = http.request(options, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log(body));
});
req.write(data);
req.end();
