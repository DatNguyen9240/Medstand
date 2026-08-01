const fs=require('fs'),path=require('path'),sql=require('mssql');
const ROOT='c:/Users/Legion/Desktop/AI Nhà Thuốc/Medstand';
const env={};for(const l of fs.readFileSync(path.join(ROOT,'.env'),'utf8').split(/\r?\n/)){const m=l.match(/^\s*([^#=]+)=(.*)$/);if(m)env[m[1].trim()]=m[2].trim();}
(async()=>{const p=await sql.connect({server:env.TEST_DB_SERVER,port:Number(env.TEST_DB_PORT||1433),database:env.TEST_DB_DATABASE,user:env.TEST_DB_USER,password:env.TEST_DB_PASSWORD,options:{encrypt:false,trustServerCertificate:true},requestTimeout:120000});
const r=await p.request().input('Username',sql.VarChar(50),'BinhPhuocA').input('ObjectID',sql.VarChar(50),'SGNB0001').execute('API_HangHoaList_AI');
const cols=Object.keys(r.recordset[0]||{});
console.log('Cot API tra ve:', cols.join(', '));
console.log('\n3 dong dau (cot dac biet):');
for(const x of r.recordset.slice(0,3)) console.log(JSON.stringify(Object.fromEntries(Object.entries(x).map(([k,v])=>[k,typeof v==='string'&&v.length>60?v.slice(0,60)+'...':v]))) );
console.log('\nCac cot gia/ck/khuyen mai:');
for(const c of cols) if(/price|gia|ck|discount|khuyen|mua|tang|cot|%/i.test(c)) console.log(' ', c, '->', JSON.stringify(r.recordset[0][c]));
await p.close();})().catch(e=>{console.error(e.message);});
