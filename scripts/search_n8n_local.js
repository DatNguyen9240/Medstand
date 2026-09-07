'use strict';

// An isolated copy keeps unrelated scheduled jobs and Telegram sends disabled.
const fs = require('fs');
const path = require('path');
const {spawnSync, spawn} = require('child_process');
const sqlite = require('sqlite3');
const crypto = require('crypto');
const root = path.resolve(__dirname,'..');
const folder = path.join(root,'.runtime-backups','search-n8n');
fs.mkdirSync(folder,{recursive:true});
const keyFile=path.join(folder,'test-ingest.key');
if(!fs.existsSync(keyFile))fs.writeFileSync(keyFile,crypto.randomBytes(32).toString('hex'));
const localKey=fs.readFileSync(keyFile,'utf8').trim();
const env = {...process.env};
for (const line of fs.readFileSync(path.join(root,'.env'),'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([^#=]+)=(.*)$/);
  if (match && env[match[1].trim()] === undefined) env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g,'');
}
Object.assign(env,{N8N_USER_FOLDER:folder, N8N_PORT:'5678', N8N_HOST:'127.0.0.1', N8N_LISTEN_ADDRESS:'127.0.0.1',N8N_PROTOCOL:'http',N8N_DIAGNOSTICS_ENABLED:'false',N8N_VERSION_NOTIFICATIONS_ENABLED:'false',N8N_BLOCK_ENV_ACCESS_IN_NODE:'false',N8N_DISABLE_TASK_RUNNERS:'true',N8N_LOG_LEVEL:'warn',NODES_EXCLUDE:'[]'});
env.TELEGRAM_INTERNAL_BRIDGE_KEY=crypto.createHash('sha256').update('search-test-bridge:'+localKey).digest('hex');
env.TELEGRAM_API_BASE='http://127.0.0.1:5680';
env.TELEGRAM_CHATBOT_BOT_TOKEN='search-test-only';
const node = path.join(root,'n8n-system/.bin/node-v22.14.0-win-x64/node.exe');
const bin = path.join(root,'n8n-system/n8n_data/npm_global/node_modules/n8n/bin/n8n');
env.NODE_PATH = path.join(root,'n8n-system/n8n_data/npm_global/node_modules');
function run(args) {
  const r=spawnSync(node,[bin,...args],{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:120000});
  if(r.status!==0) throw new Error('n8n '+args[0]+' failed: '+(r.error?.message || (r.stderr||r.stdout).slice(-1500)));
}
function dbRun(file,query) {return new Promise((resolve,reject)=>{const db=new sqlite.Database(file);db.exec(query,e=>{db.close();e?reject(e):resolve()})})}
async function main() {
  if(process.argv.includes('--start')) {
    const child=spawn(node,[bin,'start'],{cwd:root,env,stdio:'inherit',windowsHide:true});
    fs.writeFileSync(path.join(folder,'n8n.pid'),String(child.pid));
    child.on('exit',code=>process.exit(code||0));
    return;
  }
  const dest=path.join(folder,'.n8n');
  fs.mkdirSync(dest,{recursive:true});
  const dbPath=path.join(dest,'database.sqlite');
  if(!fs.existsSync(dbPath)) {
    // Source runtime must be offline when taking the initial copy.
    const source=path.join(root,'n8n-system/n8n_data/.n8n');
    for(const file of ['database.sqlite','database.sqlite-wal','database.sqlite-shm','config']) {
      if(fs.existsSync(path.join(source,file))) fs.copyFileSync(path.join(source,file),path.join(dest,file));
    }
  }
  await dbRun(dbPath,'UPDATE workflow_entity SET active=0, activeVersionId=NULL; DELETE FROM webhook_entity;');
  const selected=['n8n/API_Services/API_Execute.json','n8n/AI_Core/MAIN_ChatBot_V5.json','n8n/Telegram/TG_Auth_Verify.json','n8n/Telegram/TG_ChatBot_Demo.json'];
  for(const file of selected) {
    const w=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
    for(const n of w.nodes) if(n.credentials?.microsoftSql) n.credentials.microsoftSql={id:'TpdxwsQAMalt6YK3',name:'Microsoft SQL account'};
    delete w.staticData;
    const input=path.join(folder,w.id+'.json');
    fs.writeFileSync(input,JSON.stringify(w));
    run(['import:workflow','--input',input]);
    run(['publish:workflow','--id',w.id]);
  }
  run(['publish:workflow','--id','9UxECqxRaPGMF8EM']);
  // Use the medtest credentials explicitly, without exporting any existing secrets.
  if(String(env.TEST_DB_DATABASE).toLowerCase()!=='medtest') throw new Error('medtest only');
  const creds=path.join(folder,'search-sql-credentials.json');
  fs.writeFileSync(creds,JSON.stringify([{id:'TpdxwsQAMalt6YK3',name:'Microsoft SQL account',type:'microsoftSql',data:{server:env.TEST_DB_SERVER,database:env.TEST_DB_DATABASE,user:env.TEST_DB_USER,password:env.TEST_DB_PASSWORD,port:Number(env.TEST_DB_PORT||1433),tls:false,allowUnauthorizedCerts:true,connectTimeout:15000,requestTimeout:120000}}]));
  try {run(['import:credentials','--input',creds]);} finally {fs.unlinkSync(creds);}
  // The actual Telegram node runs against a localhost capture server, never Telegram.
  const transport=path.join(folder,'search-transport-credentials.json');
  fs.writeFileSync(transport,JSON.stringify([
    {id:'medstandTelegramChatbotDemo',name:'Telegram Chatbot Demo',type:'telegramApi',data:{accessToken:'search-test-only',baseUrl:'http://127.0.0.1:5680'}},
    {id:'medstandTelegramPollerHeader',name:'Telegram Poller Local Auth',type:'httpHeaderAuth',data:{name:'x-search-test-key',value:localKey}}
  ]));
  try {run(['import:credentials','--input',transport]);} finally {fs.unlinkSync(transport);}
  console.log('Isolated n8n prepared: MAIN, API Execute, auth guards, Telegram workflow. Telegram transport is localhost:5680; schedules disabled.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
