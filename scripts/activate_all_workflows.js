const sqlite3 = require('sqlite3').verbose();

const dbPath = 'd:/HoangDang/IT/Medstand/n8n-system/n8n_data/.n8n/database.sqlite';
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
});

db.run(`UPDATE workflow_entity SET active = 1`, [], function(err) {
    if (err) {
        console.error('Error updating database:', err.message);
        db.close();
        process.exit(1);
    }
    console.log(`Successfully activated ${this.changes} workflows in n8n database.`);
    db.close();
});
