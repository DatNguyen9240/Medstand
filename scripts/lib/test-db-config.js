const { loadLocalEnv } = require('./load-local-env');

function testDbConfig(root) {
  loadLocalEnv(root);
  const required = ['TEST_DB_SERVER', 'TEST_DB_DATABASE', 'TEST_DB_USER', 'TEST_DB_PASSWORD'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing local DB configuration: ${missing.join(', ')}`);

  const rawServer = process.env.TEST_DB_SERVER;
  const serverMatch = rawServer.match(/^(.+?)[,:](\d+)$/);
  return {
    server: serverMatch ? serverMatch[1] : rawServer,
    port: Number(process.env.TEST_DB_PORT || (serverMatch && serverMatch[2]) || 1433),
    database: process.env.TEST_DB_DATABASE,
    user: process.env.TEST_DB_USER,
    password: process.env.TEST_DB_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 60000,
    requestTimeout: 120000,
  };
}

module.exports = { testDbConfig };
