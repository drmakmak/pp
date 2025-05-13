const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'urls.json');

// Load URL data
let urlDatabase = {};
if (fs.existsSync(DATA_FILE)) {
    urlDatabase = JSON.parse(fs.readFileSync(DATA_FILE));
}

app.use(express.json());
app.use(express.static('public'));

// API endpoint to create short URL
app.post('/api/shorten', (req, res) => {
    const { originalUrl, customPath } = req.body;
    
    if (!originalUrl) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    // Generate a random path if none provided
    let path = customPath || Math.random().toString(36).substring(2, 8);
    
    // If custom path exists, append random chars
    if (customPath && urlDatabase[path]) {
        path += Math.random().toString(36).substring(2, 4);
    }
    
    // Store the mapping
    urlDatabase[path] = originalUrl;
    
    // Save to file
    fs.writeFileSync(DATA_FILE, JSON.stringify(urlDatabase));
    
    const shortUrl = `${req.headers.host}/${path}`;
    res.json({ shortUrl });
});

// Redirect short URLs
app.get('/:path', (req, res) => {
    const { path } = req.params;
    
    if (urlDatabase[path]) {
        res.redirect(urlDatabase[path]);
    } else {
        res.status(404).send('URL not found');
    }
});

// Serve index.html for root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});