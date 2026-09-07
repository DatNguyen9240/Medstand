'use strict';
const fs=require('fs');
const path=require('path');
const file=path.join(__dirname,'../n8n/Telegram/TG_ChatBot_Demo.json');
const wf=JSON.parse(fs.readFileSync(file,'utf8'));
function edit(name,marker,anchor,replacement){
 const n=wf.nodes.find(n=>n.name===name);
 if(n.parameters.jsCode.includes(marker))return;
 if(!n.parameters.jsCode.includes(anchor))throw Error('Missing '+name+' anchor');
 n.parameters.jsCode=n.parameters.jsCode.replace(anchor,replacement);
}
edit('Normalize Telegram Update','// SEARCH_CALLBACK','const draftCallback =',String.raw`// SEARCH_CALLBACK: 38 ASCII bytes, including token + index; no entity ID in callback.
const selectionCallback = /^pick:([0-9a-f]{32}):([0-7])$/.exec(callbackData);
if (selectionCallback) callbackActions[callbackData] = 'Chọn kết quả';
const draftCallback =`);
edit('Normalize Telegram Update','selection: selectionCallback','  isCallback, callbackQueryId, callbackData, isLoginCommand,',`  isCallback, callbackQueryId, callbackData, isLoginCommand,
  selection: selectionCallback ? {token:selectionCallback[1],index:Number(selectionCallback[2])} : null,`);
const call=wf.nodes.find(n=>n.name==='Call MAIN ChatBot');
call.parameters.jsonBody="={{ JSON.stringify($json.selection ? {action:'select_result',selection:$json.selection,conversationId:$json.conversationId} : {message:$json.text,conversationId:$json.conversationId,historyContext:''}) }}";
edit('Format Chatbot Reply','// SEARCH_SELECTION_REPLY','const technical =',String.raw`// SEARCH_SELECTION_REPLY must precede business table formatting.
if (raw.status === 'NEEDS_SELECTION') {
  const token = String(raw.selection?.token || '');
  const rows = Array.isArray(raw.data) ? raw.data.slice(0,8) : [];
  if (!/^[a-f0-9]{32}$/.test(token) || !rows.length) return [{json:{...source,telegramText:'Không thể mở danh sách lựa chọn. Vui lòng tìm lại.'}}];
  const selectionButtons = rows.map((row,index)=>({text:[row.id,row.label,row.phone,row.branch || row.BranchID].filter(Boolean).join(' · ').slice(0,120),callback_data:'pick:'+token+':'+index}));
  return [{json:{...source,telegramText:raw.message || 'Có nhiều kết quả trùng khớp. Vui lòng chọn:',selectionButtons}}];
}
const technical =`);
edit('Split Telegram Message','showSelectionButtons:','  draftToken: String($json.draftToken || \'\')',`  draftToken: String($json.draftToken || ''),
  showSelectionButtons: Array.isArray($json.selectionButtons) && $json.selectionButtons.length > 0 && index === chunks.length - 1,
  selectionButtons: index === chunks.length - 1 ? ($json.selectionButtons || []) : []`);
edit('Split Telegram Message','selectionMarkup:',"  selectionButtons: index === chunks.length - 1 ? ($json.selectionButtons || []) : []",`  selectionButtons: index === chunks.length - 1 ? ($json.selectionButtons || []) : [],
  selectionMarkup: {inline_keyboard: ($json.selectionButtons || []).map(button => [{text:button.text,callback_data:button.callback_data}])}`);
const condition=JSON.parse(JSON.stringify(wf.nodes.find(n=>n.name==='Show Draft Confirmation?')));
Object.assign(condition,{name:'Show Selection Buttons?',id:'tg-search-selection-condition',position:[1050,300]});
condition.parameters.conditions.conditions[0].leftValue='={{ $json.showSelectionButtons }}';
// Telegram node fixedCollection drops dynamic rows at runtime. Send the exact JSON
// keyboard through HTTP instead. The bot token remains server-side in the runtime env.
const send={name:'Send Selection Choices',id:'tg-search-selection-send',position:[1250,300],type:'n8n-nodes-base.httpRequest',typeVersion:4.2,
  parameters:{method:'POST',url:"={{ ($env.TELEGRAM_API_BASE || 'https://api.telegram.org') + '/bot' + $env.TELEGRAM_CHATBOT_BOT_TOKEN + '/sendMessage' }}",sendBody:true,specifyBody:'json',jsonBody:"={{ JSON.stringify({chat_id:$json.chatId,text:$json.text,parse_mode:'HTML',reply_markup:$json.selectionMarkup}) }}",options:{timeout:15000}},
  retryOnFail:true,maxTries:2,waitBetweenTries:1000};
call.parameters.options.response.response.neverError=true;
for(const n of [condition,send]){const i=wf.nodes.findIndex(x=>x.name===n.name);if(i<0)wf.nodes.push(n);else wf.nodes[i]=n;}
const edge=name=>({node:name,type:'main',index:0});
wf.connections['Show Draft Confirmation?'].main[1]=[edge('Show Selection Buttons?')];
wf.connections['Show Selection Buttons?']={main:[[edge('Send Selection Choices')],[edge('Send Telegram Reply')]]};
wf.connections['Send Selection Choices']={main:[[edge('Release Processing Slot')]]};
fs.writeFileSync(file,JSON.stringify(wf,null,2)+'\n');
console.log('Telegram search callback + choices updated (not deployed).');
