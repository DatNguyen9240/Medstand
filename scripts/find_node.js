const fs = require('fs');
const path = require('path');
const filePath = path.join('c:', 'MedApp', 'n8n', 'AI_Core', 'MAIN_ChatBot_V5.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const node = data.nodes.find(n => n.name === 'Respond Fast');
console.log(JSON.stringify(node, null, 2));
