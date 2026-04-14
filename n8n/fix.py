import json
import os

json_path = r'C:\Git cua tui\Medstand\n8n\K_SieuLuong_V2.json'
prompt_path = r'C:\Git cua tui\Medstand\n8n\prompt.txt'

# Read prompt
with open(prompt_path, 'r', encoding='utf-8') as f:
    prompt_text = f.read()

# Read JSON
with open(json_path, 'r', encoding='utf-8-sig') as f:
    workflow = json.load(f)

# Fix the node
for node in workflow.get('nodes', []):
    if node.get('name') and 'Extract Intent' in node.get('name'):
        try:
            # We found the node! Assign the raw string back!
            node['parameters']['messages']['messageValues'][0]['message'] = prompt_text
        except KeyError:
            pass

# Write JSON
with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(workflow, f, indent=4, ensure_ascii=False)

print("Workflow successfully repaired!")
