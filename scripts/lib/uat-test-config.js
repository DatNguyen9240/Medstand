'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function readLocalEnv(fileName) {
  const filePath = path.join(ROOT, fileName);
  const values = {};
  if (!fs.existsSync(filePath)) return values;

  for (const line of fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (!match) continue;
    values[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function getRequiredUatPassword(extraKeys = []) {
  const values = {
    ...readLocalEnv('.env'),
    ...readLocalEnv('.env.uat.local'),
    ...process.env
  };
  const keys = [...extraKeys, 'APP_PASSWORD', 'UAT_TEST_PASSWORD'];
  for (const key of keys) {
    if (values[key]) return values[key];
  }
  throw new Error(
    `Thiếu mật khẩu UAT. Hãy đặt một trong các biến ${keys.join(', ')} ` +
    'trong môi trường hoặc .env.uat.local (file này bị Git ignore).'
  );
}

module.exports = { getRequiredUatPassword };
