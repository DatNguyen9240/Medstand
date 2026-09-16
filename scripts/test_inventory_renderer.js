'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const renderers = {};
const source = fs.readFileSync(
  path.resolve(__dirname, '../chatbot-widget/js/chatbot-product-card.js'),
  'utf8'
);
const oldTable = (rows, header, apiCode) => `OLD_TABLE:${apiCode}:${rows.length}`;
const context = {
  window: {
    ApiChatbot: {
      registerRenderer: (name, renderer) => { renderers[name] = renderer; },
      __internal: {
        renderCardView: oldTable,
        renderCatalogView: oldTable
      }
    },
    addEventListener: () => {}
  },
  document: {
    documentElement: { setAttribute: () => {} }
  },
  localStorage: { getItem: () => '{}' },
  setInterval: () => ({ unref: () => {} }),
  setTimeout: () => {},
  Intl,
  Number,
  String,
  Array,
  Object,
  JSON
};

vm.runInNewContext(source, context);

const inventoryRows = [{
  ItemID: 'A008',
  ItemName: 'Aquamed Plus',
  PhysicalStock: 100,
  ReservedStock: 10,
  AvailableStock: 90,
  StockDataStatus: 'AVAILABLE_FOR_SALE'
}];

const defaultInventory = renderers.DEFAULT(inventoryRows, '', '@danh_sach_tonkho', {});
const productTemplateInventory = renderers.PRODUCT_LOOKUP(inventoryRows, '', '@danh_sach_tonkho', {});
assert.ok(defaultInventory.includes('OLD_TABLE:@danh_sach_tonkho:1'));
assert.ok(productTemplateInventory.includes('OLD_TABLE:@danh_sach_tonkho:1'));
assert.ok(defaultInventory.includes('ai-inventory-compact'));
assert.ok(
  renderers.DEFAULT(inventoryRows, '', '@tra_cuu_san_pham', {})
    .includes('OLD_TABLE:@tra_cuu_san_pham:1')
);
assert.ok(
  renderers.PRODUCT_LOOKUP(inventoryRows, '', '@tra_cuu_san_pham', {})
    .includes('ai-product-lookup-compact')
);

const tablePolicy = fs.readFileSync(
  path.resolve(__dirname, '../chatbot-widget/js/chatbot-table-ui-policy.js'),
  'utf8'
);
const productionIndex = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
assert.ok(tablePolicy.includes('.chat-bubble.ai .ai-table-page-size-label{display:none!important}'));
assert.ok(productionIndex.includes('chatbot-table-ui-policy.min.js?v=1'));

console.log('Inventory/table renderer: PASS 7/7');
