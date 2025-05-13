require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 8080;
const DATA_FILE = path.join(__dirname, 'urls.json');
const DOMAIN = process.env.DOMAIN || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:8080');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Database functions
async function loadDatabase() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return data ? JSON.parse(data) : {};
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.writeFile(DATA_FILE, JSON.stringify({}));
            return {};
        }
        console.error('Database error:', error);
        return {};
    }
}

async function saveUrl(shortId, originalUrl) {
    try {
        const db = await loadDatabase();
        db[shortId] = originalUrl;
        await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2));
        return true;
    } catch (error) {
        console.error('Save error:', error);
        return false;
    }
}

// API Routes
app.post('/api/shorten', async (req, res) => {
    try {
        // Validate Content-Type
        if (!req.is('application/json')) {
            return res.status(400).json({ 
                error: 'Invalid Content-Type',
                details: 'Expected application/json' 
            });
        }

        const { url: originalUrl, customPath } = req.body;
        
        // Validate required fields
        if (!originalUrl) {
            return res.status(400).json({ 
                error: 'Missing required field',
                details: 'The "url" field is required' 
            });
        }

        // Validate URL format
        try {
            new URL(originalUrl);
        } catch {
            return res.status(400).json({ 
                error: 'Invalid URL format',
                details: 'Please include http:// or https://' 
            });
        }

        // Generate or use custom path
        const shortId = customPath?.trim() || uuidv4().substring(0, 8);
        const db = await loadDatabase();

        if (db[shortId]) {
            return res.status(409).json({ 
                error: 'Short path already exists',
                details: 'Please choose a different custom path' 
            });
        }

        // Save to database
        const success = await saveUrl(shortId, originalUrl);
        if (!success) {
            return res.status(500).json({ 
                error: 'Failed to save URL',
                details: 'Please try again later' 
            });
        }

        res.json({
            originalUrl,
            shortUrl: `${DOMAIN}/${shortId}`,
            shortId
        });
    } catch (error) {
        console.error('Shorten error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
});

// Redirect route
app.get('/:shortId', async (req, res) => {
    try {
        const { shortId } = req.params;
        const db = await loadDatabase();
        
        if (db[shortId]) {
            return res.redirect(db[shortId]);
        }
        
        res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
    } catch (error) {
        console.error('Redirect error:', error);
        res.status(500).send('Internal server error');
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Domain: ${DOMAIN}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});