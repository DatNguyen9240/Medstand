{
  "Task": "CUSTOMER-NEW-001",
  "Date": "23/08/2026",
  "Decision": "Lọc khách mới mua hàng tháng 08/2026",
  "Contract": "Tháng 08/2026",
  "Threshold": {
    "MB": 600000,
    "MN": 500000
  },
  "ExcludeRules": [
    "change_code",
    "same_owner",
    "company_not_recognize"
  ],
  "Source": "CF_ObjectTbl + AR_OrderTbl + AR_InvoiceTbl",
  "Audit": "version 1.0",
  "Evidence": "reports\\CUSTOMER-NEW-001_CONTRACT.md",
  "Status": "CONTRACT_CHOT"
}