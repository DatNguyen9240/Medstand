const fs = require('fs');
let c = fs.readFileSync('chatbot-api-engine.js', 'utf8');

const regex = /for\s*\(\s*var\s*i\s*=\s*0;\s*i\s*<\s*tokens\.length[^)]*\)\s*\{[\s\S]*?params\[fCode\]\s*=\s*tokens\[i\];\s*}\s*}/;

const replacement = `for (var i = 0; i < tokens.length && i < visibleFields.length; i++) {
                    var vField = visibleFields[i];
                    var fCode = vField.FieldCode || vField.field || vField.name || '';
                    if (fCode) {
                        if (!fCode.startsWith('@')) fCode = '@' + fCode;
                        if (tokens[i].indexOf('=') === -1) {
                            params[fCode] = tokens[i];
                        }
                    }
                }`;

c = c.replace(regex, replacement);
fs.writeFileSync('chatbot-api-engine.js', c);
