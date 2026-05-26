const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Serve static files from the root directory
app.use(express.static(__dirname));

// Direct all other requests to index.html (SPA routing support)
app.get('*all', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log('===================================================');
    console.log(`🚀 MEDSTAND FRONTEND SERVER IS RUNNING`);
    console.log(`   Local URL: http://localhost:${PORT}`);
    console.log('===================================================');
});
