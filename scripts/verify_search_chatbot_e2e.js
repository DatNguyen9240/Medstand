'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const puppeteer=require('puppeteer-core');
const {getRequiredUatPassword}=require('./lib/uat-test-config');
const {requestParams}=require('./lib/search-n8n-trace');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'.runtime-backups/search-n8n');
const base=process.env.SEARCH_WEB_URL||'http://localhost:3000';
const username=process.env.APP_USER||'QLBH013.MED';
const password=getRequiredUatPassword();
function decrypt(value){const x=Buffer.from(value,'base64').toString('latin1');return Buffer.from([...x].map(c=>String.fromCharCode(c.charCodeAt(0)^107)).join(''),'base64').toString('utf8')}
function encrypt(value){const b64=Buffer.from(value,'utf8').toString('base64');return Buffer.from([...b64].map(c=>String.fromCharCode(c.charCodeAt(0)^107)).join(''),'latin1').toString('base64')}
async function main(){
  const health=await fetch('http://127.0.0.1:5678/healthz');
  assert(health.ok,'Start isolated n8n before running this test');
  const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();
  await page.setViewport({width:1280,height:900});
  const replies=[];
  page.on('response',async res=>{
    if(!res.url().includes('/api/gateway'))return;
    try{
      const req=JSON.parse(decrypt(JSON.parse(res.request().postData()).data));
      if(!String(req.endpoint).includes('hook-ai-dainao'))return;
      const body=JSON.parse(decrypt((await res.json()).data));
      replies.push({request:req.body,status:res.status(),body});
      console.log(JSON.stringify({http:res.status(),status:body.status,code:body.code,count:body.count,message:body.message}));
    }catch(_){}
  });
  try{
    await page.goto(base+'/pages/login.html',{waitUntil:'networkidle0'});
    await page.type('#username',username);
    await page.type('#password',password);
    await page.click('#btn-login');
    await page.waitForFunction(()=>document.cookie.includes('auth_token='),{timeout:20000});
    await page.waitForFunction(()=>typeof navigate==='function');
    await page.evaluate(()=>navigate('chatbot'));
    await page.waitForSelector('#chat-input',{visible:true,timeout:20000});
    await page.type('#chat-input','Công nợ nhà thuốc Tâm Đức');
    await page.click('#btn-send');
    await page.waitForSelector('.chat-selection-option',{timeout:65000});
    const first=replies.find(r=>r.body.status==='NEEDS_SELECTION');
    assert(first,'Actual n8n must return NEEDS_SELECTION');
    assert(first.body.selection?.token,'Actual n8n must issue token');
    assert(first.body.data.length>1);
    assert.equal(await page.$$eval('.chat-selection-option',bs=>bs.length),first.body.data.length);
    await page.screenshot({path:path.join(output,'chatbot-selection.png')});
    // Select a non-first candidate, proving no silent TOP 1 substitution.
    const chosen=first.body.data[1].id;
    const authCookie=(await page.cookies()).find(c=>c.name==='auth_token');
    const callChat=async body=>{
      const response=await fetch(base+'/api/gateway',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+decodeURIComponent(authCookie.value)},body:JSON.stringify({data:encrypt(JSON.stringify({method:'POST',endpoint:'/webhook/hook-ai-dainao',body}))})});
      return {status:response.status,body:JSON.parse(decrypt((await response.json()).data))};
    };
    const selectionRequest={action:'select_result',conversationId:first.request.conversationId,selection:{token:first.body.selection.token,id:chosen}};
    for(const bad of [
      {...selectionRequest,conversationId:'other-conversation'},
      {...selectionRequest,selection:{...selectionRequest.selection,id:'OUTSIDE-CANDIDATES'}},
      {...selectionRequest,selection:{...selectionRequest.selection,id:undefined,index:99}}
    ]){
      const rejected=await callChat(bad);
      assert.equal(rejected.body.code,'SELECTION_TOKEN_INVALID');
      assert.equal(rejected.body.data.length,0);
    }
    const selectionResponse=page.waitForResponse(res=>{
      try { return res.url().includes('/api/gateway') && JSON.parse(decrypt(JSON.parse(res.request().postData()).data)).body?.action==='select_result'; } catch (_) { return false; }
    },{timeout:65000});
    await page.$$eval('.chat-selection-option',bs=>bs[1].click());
    const actual=await selectionResponse;
    const selected={request:JSON.parse(decrypt(JSON.parse(actual.request().postData()).data)).body,body:JSON.parse(decrypt((await actual.json()).data))};
    await page.waitForFunction(()=>!document.querySelector('#chat-typing'),{timeout:65000});
    assert(selected,'Selection must go through the gateway and real n8n');
    assert.equal(selected.request.selection.id,chosen);
    assert(['SUCCESS','NO_DATA'].includes(selected.body.status),JSON.stringify(selected.body));
    assert(!('params' in selected.request),'Client must not replay business params');
    const originalParams=await requestParams(first.body.requestId);
    const replayedParams=await requestParams(selected.body.requestId);
    assert.equal(replayedParams['@MaKhachHang'],chosen,'The real SQL execution must use the chosen non-first customer');
    assert.equal(replayedParams['@DenNgay'],originalParams['@DenNgay'],'Keep the original date filter');
    const resultRows=selected.body.data||[];
    for(const row of resultRows){
      const id=row.MaKhachHang||row.ObjectID;
      if(id)assert.equal(id,chosen);
    }
    await page.screenshot({path:path.join(output,'chatbot-selected.png')});
    const replay=await callChat(selectionRequest);
    assert.equal(replay.body.code,'SELECTION_TOKEN_INVALID');
    const exact=await callChat({text:'Công nợ khách hàng '+chosen,conversationId:first.request.conversationId});
    assert(['SUCCESS','NO_DATA'].includes(exact.body.status));
    const ctbh=await callChat({text:'CTBH Antrinano',conversationId:first.request.conversationId});
    assert.equal(ctbh.body.ApiCode,'@ctbh_san_pham',JSON.stringify(ctbh.body));
    assert(['SUCCESS','NO_DATA'].includes(ctbh.body.status),JSON.stringify(ctbh.body));
    assert.equal(ctbh.body.needsRagFallback,false);
    const search15=await callChat({text:'Công nợ nhà thuốc Minh Anh',conversationId:first.request.conversationId});
    assert.equal(search15.body.ApiCode,'@cong_no_chi_tiet');
    assert(['NEEDS_SELECTION','SUCCESS','NO_DATA'].includes(search15.body.status));
    const search15Params=await requestParams(search15.body.requestId);
    assert.equal(search15Params['@MaKhachHang'],'Minh Anh');
    const summary={task:'SEARCH-CHATBOT-WEB-E2E',status:'PASS',transport:'browser -> gateway -> isolated n8n -> medtest',candidateCount:first.body.data.length,selectedIndex:1,resultStatus:selected.body.status,sqlExecutionTarget:'VERIFIED',originalDateFilter:'PRESERVED',wrongConversation:'REJECTED',outsideCandidate:'REJECTED',invalidIndex:'REJECTED',reuse:'REJECTED',exactCustomer:exact.body.status,SEARCH14:{api:ctbh.body.ApiCode,status:ctbh.body.status,ragFallback:false},SEARCH15:{api:search15.body.ApiCode,status:search15.body.status,customerTextPreserved:true}};
    fs.writeFileSync(path.join(output,'chatbot-e2e-summary.json'),JSON.stringify(summary,null,2));
    console.log(JSON.stringify(summary));
  }catch(e){
    await page.screenshot({path:path.join(output,'chatbot-failure.png')}).catch(()=>{});
    fs.writeFileSync(path.join(output,'chatbot-failure.json'),JSON.stringify(replies,null,2));
    throw e;
  }finally{await browser.close()}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
