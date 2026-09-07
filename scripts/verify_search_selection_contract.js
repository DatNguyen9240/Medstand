'use strict';
const assert=require('assert');
const main=require('../n8n/AI_Core/MAIN_ChatBot_V5.json');
const tg=require('../n8n/Telegram/TG_ChatBot_Demo.json');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function execute(wf,name,json,refs={}){
 const source=wf.nodes.find(n=>n.name===name).parameters.jsCode;
 const item={json};
 const fn=new AsyncFunction('$json','$input','$','$getWorkflowStaticData','global','Buffer',source);
 const result=await fn(json,{first:()=>item,all:()=>[item]},key=>({first:()=>({json:refs[key]||{}})}),()=>({}),{},Buffer);
 return result[0].json;
}
async function run(){
 const norm={userProfile:{authenticated:true,identitySource:'API_UserInfo_VERIFIED'},verifiedUserId:'QLBH013.MED',contextKey:'ctx-test-real-session',originalBody:{action:'select_result',selection:{token:'a'.repeat(32),id:'KH002'}}};
 const refs={'LIB NormalizeInput':norm};
 let request=await execute(main,'Prepare Selection Request',norm,refs);
 assert(request.selectionSql.includes('API_SelectionToken_Consume_AI'));
 assert(request.selectionSql.includes("N'KH002'"));
 const noIdentity=await execute(main,'Prepare Selection Request',{}, {'LIB NormalizeInput':{...norm,userProfile:{authenticated:false}}});
 assert(!noIdentity.selectionSql.includes('EXEC'));
 norm.originalBody.selection={token:'a'.repeat(32),index:1};
 request=await execute(main,'Prepare Selection Request',norm,refs);
 assert(request.selectionSql.includes('@ChosenIndex=1'));
 norm.originalBody.selection.index=8;
 assert(!(await execute(main,'Prepare Selection Request',norm,refs)).selectionSql.includes('EXEC'));
 const pending={ApiCode:'@doanh_so',Params:{'@TuNgay':'2026-01-01','@DenNgay':'2026-01-31','@ObjectName':'Trùng tên','@Username':'spoof','@MaKhachHang':'Trùng tên'}};
 const consumed={MsgType:0,EntityType:'CUSTOMER',ConsumedEntityID:'KH002',PendingRequestJson:JSON.stringify(pending)};
 const restored=await execute(main,'Restore Selection Intent',consumed,refs);
 assert(restored.selectionValid);
 assert.deepEqual(restored.quickIntent.params,{'@TuNgay':'2026-01-01','@DenNgay':'2026-01-31','@MaKhachHang':'KH002'});
 const mutation=await execute(main,'Restore Selection Intent',{...consumed,PendingRequestJson:JSON.stringify({...pending,ApiCode:'@lap_don_hang'})},refs);
 assert.equal(mutation.selectionValid,false);
 const format=await execute(main,'Format Response',{cleanParams:{}},{});
 assert.equal(format.code,'INVALID_EXECUTE_RESPONSE');
 const profile={authenticated:true,verifiedUserId:'QLBH013.MED',serverSessionId:'ss-'+'b'.repeat(40)};
 const normalize=async text=>execute(main,'LIB NormalizeInput',{body:{text,conversationId:'test-conversation'},userProfile:profile});
 for(const text of ['Công nợ nhà thuốc Minh Anh','cong no nha thuoc Minh Anh']){
  const n=await normalize(text);assert.equal(n.quickIntent.params['@MaKhachHang'],'Minh Anh');assert.equal(n.quickIntent.requiresClarification,false);
 }
 const generic=await normalize('Công nợ khách hàng');
 assert(!generic.quickIntent.params['@MaKhachHang']);
 for(const text of ['Doanh số tháng này của tôi bao nhiêu?','Doanh số nhân viên tháng này','Hóa đơn tháng 8']) {
  assert(!(await normalize(text)).quickIntent?.params?.['@MaKhachHang'],text);
 }
 const promotion=await normalize('CTBH Antrinano');
 assert.equal(promotion.quickIntent.intent,'@ctbh_san_pham');
 assert.equal(promotion.quickIntent.params['@timkiem'],'Antrinano');
 assert.equal((await normalize('CTBH')).quickIntent.requiresClarification,true);
 const businessReply={status:'NEEDS_SELECTION',message:'Chọn khách',selection:{token:'a'.repeat(32)},data:[{id:'KH001',label:'Tên <script>',phone:'0123'},{id:'KH002',label:'Khách thứ hai'}]};
 const formatted=await execute(tg,'Format Chatbot Reply',businessReply,{'Prepare Authorized Action':{chatId:'123',text:'Công nợ'}});
 assert.equal(formatted.selectionButtons.length,2);
 assert(Buffer.byteLength(formatted.selectionButtons[1].callback_data)<=64);
 assert.equal(formatted.selectionButtons[1].callback_data,'pick:'+'a'.repeat(32)+':1');
 const split=await execute(tg,'Split Telegram Message',formatted);
 assert(split.showSelectionButtons);
 const callback={update_id:100,callback_query:{id:'cb1',data:formatted.selectionButtons[1].callback_data,from:{id:123},message:{chat:{id:123,type:'private'},text:'Chọn khách'}}};
 const normalized=await execute(tg,'Normalize Telegram Update',{body:callback});
 assert(normalized.canProcess);assert.deepEqual(normalized.selection,{token:'a'.repeat(32),index:1});
 callback.callback_query.data='pick:'+'a'.repeat(32)+':9';
 assert.equal((await execute(tg,'Normalize Telegram Update',{body:callback})).canProcess,false);
 const authorized=await execute(tg,'Prepare Authorized Action',{AuthStatus:'AUTHORIZED',AuthTicket:'telegram_'+'c'.repeat(64),UserName:'QLBH013.MED',Capabilities:'api.read'}, {'Normalize Telegram Update':normalized});
 assert(authorized.shouldCallMain);assert.equal(authorized.actionMode,'CHAT');assert.deepEqual(authorized.selection,normalized.selection);
 console.log('PASS: selection identity, index bounds, original filters, mutation rejection, malformed upstream, name extraction, Telegram buttons/callback routing.');
}
run().catch(e=>{console.error(e);process.exitCode=1});
