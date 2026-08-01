const fs=require('fs'),path=require('path'),sql=require('mssql');
const ROOT='c:/Users/Legion/Desktop/AI Nhà Thuốc/Medstand';
const env={};for(const l of fs.readFileSync(path.join(ROOT,'.env'),'utf8').split(/\r?\n/)){const m=l.match(/^\s*([^#=]+)=(.*)$/);if(m)env[m[1].trim()]=m[2].trim();}
(async()=>{
const p=await sql.connect({server:env.TEST_DB_SERVER,port:Number(env.TEST_DB_PORT||1433),database:env.TEST_DB_DATABASE,user:env.TEST_DB_USER,password:env.TEST_DB_PASSWORD,options:{encrypt:false,trustServerCertificate:true},requestTimeout:180000});

// 1. Tat ca cot trong AR_PromotionTbl + AR_PromotionGiftTbl
console.log('\n=== AR_PromotionTbl cols ===');
console.table((await p.request().query(`SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='AR_PromotionTbl' ORDER BY ORDINAL_POSITION`)).recordset);
console.log('\n=== AR_PromotionGiftTbl cols ===');
console.table((await p.request().query(`SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='AR_PromotionGiftTbl' ORDER BY ORDINAL_POSITION`)).recordset);
console.log('\n=== AR_PromotionDetailTbl cols ===');
console.table((await p.request().query(`SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='AR_PromotionDetailTbl' ORDER BY ORDINAL_POSITION`)).recordset);
console.log('\n=== Tat ca du lieu Promotion ===');
console.table((await p.request().query(`SELECT * FROM dbo.AR_PromotionTbl`)).recordset);
console.log('\n=== Gift tiers ===');
console.table((await p.request().query(`SELECT * FROM dbo.AR_PromotionGiftTbl ORDER BY DocumentID, TuDiem`)).recordset);
console.log('\n=== PromotionDetail (san pham trong tam) ===');
console.table((await p.request().query(`SELECT * FROM dbo.AR_PromotionDetailTbl`)).recordset);

// 2. Tat ca GhiChu trong CF_ItemTbl co chua KHHĐ
console.log('\n=== GhiChu chua KHHĐ (cac kieu viet) ===');
const khhdVariants=['KHHĐ','KHHD','khhđ','khhd','Khhđ','KhhD','KhhD'];
for(const v of khhdVariants){
  const n=(await p.request().query(`SELECT COUNT(*) AS n FROM dbo.CF_ItemTbl WHERE GhiChu LIKE '%${v}%'`)).recordset[0].n;
  console.log(`  "${v}" -> ${n} dong`);
}

// 3. Chi tiet 7 san pham bi loi cu the
console.log('\n=== 7 san pham bi loi (full GhiChu) ===');
console.table((await p.request().query(`
  SELECT I.ItemID, I.ItemName, I.UnitPrice, I.GhiChu
  FROM dbo.CF_ItemTbl I
  JOIN dbo.AR_OpListDetailTbl D ON D.EmployeeID IN ('TDV_BINHPHUOCA') AND D.ObjectGroupID = I.ObjectGroupID
  WHERE I.GhiChu LIKE '%KHH%' AND I.GhiChu NOT LIKE '%KHHD%'
  ORDER BY I.ItemID`)).recordset);

await p.close();})().catch(e=>{console.error(e.message);});
