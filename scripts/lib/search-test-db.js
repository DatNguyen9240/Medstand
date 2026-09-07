'use strict';
const fs=require('fs');
const path=require('path');
const sql=require('mssql');
async function connectMedtest(){
  const env={};
  for(const line of fs.readFileSync(path.join(__dirname,'../../.env'),'utf8').split(/\r?\n/)){
    const m=line.match(/^\s*([^#=]+)=(.*)$/);
    if(m)env[m[1].trim()]=m[2].trim().replace(/^['"]|['"]$/g,'');
  }
  Object.assign(env,process.env);
  if(String(env.TEST_DB_DATABASE).toLowerCase()!=='medtest')throw Error('medtest only');
  return new sql.ConnectionPool({server:env.TEST_DB_SERVER,port:Number(env.TEST_DB_PORT||1433),database:env.TEST_DB_DATABASE,user:env.TEST_DB_USER,password:env.TEST_DB_PASSWORD,options:{encrypt:false,trustServerCertificate:true},connectionTimeout:15000,requestTimeout:120000}).connect();
}
module.exports={connectMedtest,sql};
