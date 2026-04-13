import re

with open('chatbot-api-engine.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the first occurrence where mAD gets used
content = content.replace(
    'data-code="\' + _esc(r.value) + \'" data-phanloai="\' + _esc(mPL) + \'" data-name="\' + _esc(mName) + \'" data-madanhmuc="\' + _esc(mAD) + \'"',
    'data-code="\' + _esc(mAD) + \'" data-phanloai="\' + _esc(mPL) + \'" data-name="\' + _esc(mName) + \'" data-madanhmuc="\' + _esc(mAD) + \'"'
)

# Replace the second occurrence where idVal gets used
content = content.replace(
    'data-code="\' + _esc(r.value) + \'" data-name="\' + _esc(nameVal) + \'" data-id="\' + _esc(idVal) + \'" data-phanloai="\' + _esc(phVal) + \'"',
    'data-code="\' + _esc(idVal) + \'" data-name="\' + _esc(nameVal) + \'" data-id="\' + _esc(idVal) + \'" data-phanloai="\' + _esc(phVal) + \'"'
)

with open('chatbot-api-engine.js', 'w', encoding='utf-8') as f:
    f.write(content)
