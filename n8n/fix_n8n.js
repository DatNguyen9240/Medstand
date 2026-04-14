const fs = require('fs');

const jsonPath = 'C:\\Git cua tui\\Medstand\\n8n\\K_SieuLuong_V2.json';
const promptPath = 'C:\\Git cua tui\\Medstand\\n8n\\prompt.txt';

// Read Files natively in UTF-8
const promptText = fs.readFileSync(promptPath, 'utf8');
const jsonText = fs.readFileSync(jsonPath, 'utf8');

let workflow = JSON.parse(jsonText);

// Find Extract Intent Chain node
let chainNode = workflow.nodes.find(n => n.name && n.name.includes('Extract Intent Chain'));

if (chainNode) {
    // Overwrite the corrupted POJO with the raw string
    chainNode.parameters.messages.messageValues[0].message = promptText;
}

// Write back correctly
fs.writeFileSync(jsonPath, JSON.stringify(workflow, null, 4), 'utf8');
console.log("SUCCESS: K_SieuLuong_V2.json has been repaired.");
