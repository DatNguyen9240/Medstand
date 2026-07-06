const fs = require('fs');
const path = require('path');

function globJSON(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(globJSON(fullPath));
        } else if (file.endsWith('.json')) {
            results.push(fullPath);
        }
    });
    return results;
}

const files = globJSON('d:/HoangDang/IT/Medstand/n8n');
console.log(`Found ${files.length} JSON files:`);
files.forEach((file) => {
    try {
        const content = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (content.nodes && content.connections) {
            console.log(`- File: ${path.relative('d:/HoangDang/IT/Medstand/n8n', file)}`);
            console.log(`  Workflow Name: ${content.name} | Active: ${content.active}`);
        } else {
            console.log(`- File: ${path.relative('d:/HoangDang/IT/Medstand/n8n', file)} (Not a standard workflow)`);
        }
    } catch(e) {
        console.log(`- File: ${path.relative('d:/HoangDang/IT/Medstand/n8n', file)} (Error parsing: ${e.message})`);
    }
});
