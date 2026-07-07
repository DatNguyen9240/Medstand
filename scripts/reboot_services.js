const { execSync } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

console.log('=== SERVICE REBOOT & CLEANUP SYSTEM ===');

// 1. Force kill all running service processes to release ports and database locks
console.log('Force killing node, redis, qdrant, and cloudflared processes...');
try {
    const currentPid = process.pid;
    console.log(`Current node process PID: ${currentPid}. Killing other node processes...`);
    execSync(`powershell -NoProfile -Command "Get-Process -Name node | Where-Object { $_.Id -ne ${currentPid} } | Stop-Process -Force"`, { stdio: 'inherit' });
} catch(e) {}
try {
    execSync('taskkill /f /im redis-server.exe', { stdio: 'inherit' });
} catch(e) {}
try {
    execSync('taskkill /f /im qdrant.exe', { stdio: 'inherit' });
} catch(e) {}
try {
    execSync('taskkill /f /im cloudflared.exe', { stdio: 'inherit' });
} catch(e) {}

console.log('Waiting 3 seconds for OS cleanup...');
setTimeout(() => {
    // 2. Safe Database Patch
    console.log('Applying database patch...');
    const dbPath = path.join(__dirname, '../n8n-system/n8n_data/.n8n/database.sqlite');
    const db = new sqlite3.Database(dbPath);

    const workflowFilePath = path.join(__dirname, '../n8n/AI_Core/AI_Upload_Reader.json');
    const workflowData = JSON.parse(fs.readFileSync(workflowFilePath, 'utf8'));
    const updatedConnectionsJson = JSON.stringify(workflowData.connections);

    db.serialize(() => {
        db.get("SELECT nodes, activeVersionId FROM workflow_entity WHERE id = 'oLlOtiWCjZ2XMJcO'", (err, row) => {
            if (err) {
                console.error('Error fetching nodes:', err);
                db.close();
                return;
            }

            let fileNodes = workflowData.nodes;
            const dbNodes = (row && row.nodes) ? JSON.parse(row.nodes) : [];
            fileNodes = fileNodes.map(fNode => {
                const dbNode = dbNodes.find(d => d.name === fNode.name);
                if (dbNode && dbNode.webhookId) {
                    fNode.webhookId = dbNode.webhookId;
                }
                
                // Patch credentials to match local database IDs
                if (fNode.name === 'OpenAI Vision OCR') {
                    fNode.credentials = { openAiApi: { id: 'unPR2jmS70HqH7Q7', name: 'OpenAi account' } };
                } else if (fNode.name === 'OpenAI Embeddings') {
                    fNode.credentials = { openAiApi: { id: 'cLsH6RaatwXGoust', name: 'OpenAi account 2' } };
                } else if (fNode.name === 'Qdrant Vector Store' || fNode.name === 'Qdrant Vector Sync') {
                    fNode.credentials = { qdrantApi: { id: 'l9xHDkhSqmeIQaiv', name: 'QdrantApi account' } };
                } else if (fNode.name === 'Save OCR to DB' || fNode.name === 'Execute Approve DB') {
                    fNode.credentials = { microsoftSql: { id: 'pQJpxvWCiFkv7wn4', name: 'Microsoft SQL account' } };
                }
                return fNode;
            });

            const finalNodesJson = JSON.stringify(fileNodes);
            const activeVersionId = row ? row.activeVersionId : null;

            // Update workflow_entity nodes and connections
            db.run(
                "UPDATE workflow_entity SET nodes = ?, connections = ?, active = 1 WHERE id = 'oLlOtiWCjZ2XMJcO'",
                [finalNodesJson, updatedConnectionsJson],
                function(err) {
                    if (err) {
                        console.error('Error updating workflow_entity:', err);
                        db.close();
                        return;
                    }
                    console.log(`Successfully updated production workflow (modified ${this.changes} rows).`);

                    // Update workflow_history for the activeVersionId
                    if (activeVersionId) {
                        db.run(
                            "UPDATE workflow_history SET nodes = ?, connections = ? WHERE versionId = ?",
                            [finalNodesJson, updatedConnectionsJson, activeVersionId],
                            function(err) {
                                if (err) {
                                    console.error('Error updating workflow_history:', err);
                                } else {
                                    console.log(`Successfully updated active workflow_history. Rows modified: ${this.changes}`);
                                }
                            }
                        );
                    }

                    // Deactivate duplicates
                    db.run(
                        "UPDATE workflow_entity SET active = 0 WHERE id IN ('Skje2dw84U3sdCSP', '4caQRNkLXVnDEBHw')",
                        function(err) {
                            if (err) {
                                console.error('Error deactivating duplicate workflows:', err);
                                db.close();
                                return;
                            }
                            console.log(`Successfully deactivated duplicate workflows (modified ${this.changes} rows).`);

                            // Delete duplicated webhooks
                            db.run(
                                "DELETE FROM webhook_entity WHERE workflowId IN ('Skje2dw84U3sdCSP', '4caQRNkLXVnDEBHw')",
                                function(err) {
                                    if (err) {
                                        console.error('Error cleaning webhook_entity:', err);
                                        db.close();
                                        return;
                                    }
                                    console.log(`Cleaned ${this.changes} duplicate webhooks from webhook_entity.`);

                                    // Verify database records
                                    db.all("SELECT id, name, active FROM workflow_entity WHERE name = 'K_Admin_Upload_OmniReader'", (err, rows) => {
                                        if (err) {
                                            console.error(err);
                                        } else {
                                            console.log('\nFinal DB states:');
                                            for (const row of rows) {
                                                console.log(`ID: ${row.id}, Name: "${row.name}", Active: ${row.active}`);
                                            }
                                        }
                                        db.close();
                                        console.log('Database patch complete.');
                                    });
                                }
                            );
                        }
                    );
                }
            );
        });
    });
}, 3000);
