const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'urls.json');

// Initialize URL database
let urlDatabase = {};

// Improved file reading with error handling
function loadUrlDatabase() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const fileContent = fs.readFileSync(DATA_FILE, 'utf8').trim();
            urlDatabase = fileContent ? JSON.parse(fileContent) : {};
        } else {
            // Create file if it doesn't exist
            fs.writeFileSync(DATA_FILE, JSON.stringify(urlDatabase));
        }
    } catch (error) {
        console.error('Error loading URL database:', error);
        // Initialize empty database if file is corrupted
        urlDatabase = {};
        fs.writeFileSync(DATA_FILE, JSON.stringify(urlDatabase));
    }
}

// Load database on startup
loadUrlDatabase();

app.use(express.json());
app.use(express.static('public'));

// API endpoint to create short URL
app.post('/api/shorten', (req, res) => {
    const { originalUrl, customPath } = req.body;
    
    if (!originalUrl) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    // Validate URL format
    try {
        new URL(originalUrl);
    } catch (e) {
        return res.status(400).json({ error: 'Invalid URL format' });
    }
    
    let path = customPath || Math.random().toString(36).substring(2, 8);
    
    // If custom path exists, append random chars
    if (customPath && urlDatabase[path]) {
        path += Math.random().toString(36).substring(2, 4);
    }
    
    // Store the mapping
    urlDatabase[path] = originalUrl;
    
    // Save to file with error handling
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(urlDatabase, null, 2));
        const shortUrl = `${req.headers.host}/${path}`;
        res.json({ shortUrl });
    } catch (error) {
        console.error('Error saving URL database:', error);
        res.status(500).json({ error: 'Failed to save short URL' });
    }
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