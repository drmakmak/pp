require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 8080;
const DATA_FILE = path.join(__dirname, 'urls.json');

// Password protection configuration
const PROTECT_FRONTEND = process.env.PROTECT_FRONTEND === 'true';
const FRONTEND_PASSWORD = process.env.FRONTEND_PASSWORD || '@Ss112233';
const SESSION_SECRET = process.env.SESSION_SECRET || uuidv4();
const SESSION_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

// Simple session storage
const sessions = new Set();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Custom basic auth middleware (no external dependencies)
const checkAuth = (req, res, next) => {
  // Skip auth for API endpoints and redirects
  if (req.path.startsWith('/api') || req.path.startsWith('/:') || !PROTECT_FRONTEND) {
    return next();
  }

  // Check session token
  const token = req.headers['x-auth-token'] || req.query.token;
  if (token && sessions.has(token)) {
    return next();
  }

  // Check password in form submission
  if (req.method === 'POST' && req.path === '/login' && req.body.password === FRONTEND_PASSWORD) {
    const newToken = uuidv4();
    sessions.add(newToken);
    return res.json({ token: newToken });
  }

  // Serve login page
  if (req.accepts('html')) {
    return res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }

  res.status(401).json({ error: 'Authentication required' });
};

app.use(checkAuth);

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

// API Endpoints
app.post('/api/shorten', async (req, res) => {
  try {
    const { url: originalUrl, customPath } = req.body;
    
    if (!originalUrl) {
      return res.status(400).json({ error: 'URL is required' });
    }

    try {
      new URL(originalUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const shortId = customPath?.trim() || uuidv4().substring(0, 8);
    const db = await loadDatabase();

    if (db[shortId]) {
      return res.status(409).json({ error: 'Short path already exists' });
    }

    const success = await saveUrl(shortId, originalUrl);
    if (!success) {
      return res.status(500).json({ error: 'Failed to save URL' });
    }

    res.json({
      originalUrl,
      shortUrl: `${req.headers.host}/${shortId}`,
      shortId
    });
  } catch (error) {
    console.error('Shorten error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login endpoint
app.post('/login', (req, res) => {
  if (req.body.password === FRONTEND_PASSWORD) {
    const token = uuidv4();
    sessions.add(token);
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Redirect endpoint
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    protected: PROTECT_FRONTEND,
    uptime: process.uptime()
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Frontend protected: ${PROTECT_FRONTEND}`);
});