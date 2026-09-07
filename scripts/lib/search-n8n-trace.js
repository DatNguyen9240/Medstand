'use strict';
const path=require('path');
const sqlite=require('sqlite3');
const {parse}=require('../../n8n-system/n8n_data/npm_global/node_modules/n8n/node_modules/flatted');
const database=path.resolve(__dirname,'../../.runtime-backups/search-n8n/.n8n/database.sqlite');
async function requestParams(requestId, attempt=0){
  const match=/^req-(\d+)-/.exec(String(requestId||''));
  if(!match)throw Error('Missing real n8n execution request ID');
  const rows=await new Promise((resolve,reject)=>{
    const db=new sqlite.Database(database,sqlite.OPEN_READONLY);
    // Request IDs can originate in the Shared Auth Guard subworkflow. Match the
    // propagated request context in API Execute rather than assuming its execution ID.
    db.all('SELECT d.data FROM execution_data d JOIN execution_entity e ON e.id=d.executionId WHERE e.workflowId=? ORDER BY e.id DESC LIMIT 40',['fCJwiyAT9r6eh1ys'],(error,result)=>{db.close();error?reject(error):resolve(result)});
  });
  for(const row of rows){
    const execution=parse(row.data);
    const authorized=execution.resultData?.runData?.['Enforce API Capability']?.[0]?.data?.main?.[0]?.[0]?.json;
    if(authorized?._requestContext?.requestId===requestId)return JSON.parse(authorized._paramsSafeStr);
  }
  // RespondToWebhook runs before the final audit node and execution persistence.
  if(attempt<20){await new Promise(resolve=>setTimeout(resolve,250));return requestParams(requestId,attempt+1);}
  throw Error('Matching n8n API Execute trace not saved');
}
module.exports={requestParams};
