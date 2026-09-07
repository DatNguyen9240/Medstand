'use strict';
// Real n8n + medtest, with only the Telegram network boundary captured locally.
// No sendMessage/answerCallbackQuery request leaves localhost.
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const http=require('http');
const root=path.resolve(__dirname,'..');
const folder=path.join(root,'.runtime-backups/search-n8n');
const key=fs.readFileSync(path.join(folder,'test-ingest.key'),'utf8').trim();
const config=JSON.parse(fs.readFileSync(path.join(root,'config/telegram/uat-links.local.json'),'utf8'));
const link=config.links.find(l=>l.userName==='QLBH013.MED' && l.telegramUserId);
assert(link,'An existing QLBH013.MED UAT Telegram link is required');
const userId=String(link.telegramUserId);
const sent=[];
const acknowledgements=[];
let sequence=Date.now();
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function waitSend(after){
 const until=Date.now()+60000;
 while(Date.now()<until){if(sent.length>after)return sent[after];await delay(100)}
 throw Error('No outbound Telegram payload captured within 60s');
}
async function ingest(update){
 const response=await fetch('http://127.0.0.1:5678/webhook/telegram-poll-ingest',{method:'POST',headers:{'Content-Type':'application/json','x-search-test-key':key},body:JSON.stringify({update_id:++sequence,...update})});
 assert(response.ok,'Local Telegram ingest must accept authenticated update: '+response.status);
}
async function main(){
 const server=http.createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const body=JSON.parse(Buffer.concat(chunks).toString()||'{}');
  let result=true;
  if(req.url.endsWith('/sendMessage')){
    sent.push(body);
    result={message_id:sent.length,chat:{id:userId,type:'private'},date:Math.floor(Date.now()/1000),text:body.text,reply_markup:body.reply_markup};
  }else if(req.url.endsWith('/answerCallbackQuery'))acknowledgements.push(body);
  else {res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,result}));
 });
 await new Promise(r=>server.listen(5680,'127.0.0.1',r));
 try{
  await ingest({message:{message_id:1,from:{id:userId},chat:{id:userId,type:'private'},text:'Công nợ nhà thuốc Tâm Đức'}});
  const choices=await waitSend(0);
  const keyboard=choices.reply_markup?.inline_keyboard;
  assert(Array.isArray(keyboard) && keyboard.length>1,'Expected multiple selection buttons, received: '+choices.text);
  assert(keyboard.every(row=>row.length===1 && /^pick:[a-f0-9]{32}:[0-7]$/.test(row[0].callback_data)));
  const chosen=keyboard[1][0].callback_data;
  assert(Buffer.byteLength(chosen)<=64);
  const callback=data=>({callback_query:{id:'search-cb-'+sequence,from:{id:userId},data,message:{message_id:1,chat:{id:userId,type:'private'},text:choices.text}}});
  await delay(300);
  await ingest(callback(chosen));
  const selected=await waitSend(1);
  assert(!selected.reply_markup?.inline_keyboard?.some(row=>row.some(b=>String(b.callback_data).startsWith('pick:'))),'Selected request must leave NEEDS_SELECTION');
  assert(/công nợ/i.test(selected.text),'Expected a debt response: '+selected.text);
  await delay(300);
  await ingest(callback(chosen));
  const reused=await waitSend(2);
  assert(/không còn hiệu lực|hết hạn/i.test(reused.text),'Token replay must be rejected: '+reused.text);
  assert(acknowledgements.length>=2,'Callback acknowledgements must run');
  const summary={task:'SEARCH-TELEGRAM-N8N-RUNTIME',status:'PASS',transport:'synthetic update -> real n8n -> medtest -> localhost Telegram capture',candidateCount:keyboard.length,selectedIndex:1,callbackBytes:Buffer.byteLength(chosen),tokenReplay:'REJECTED',telegramNetworkUsed:false};
  fs.writeFileSync(path.join(folder,'telegram-runtime-summary.json'),JSON.stringify(summary,null,2));
  console.log(JSON.stringify(summary));
 }finally{await new Promise(r=>server.close(r))}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
