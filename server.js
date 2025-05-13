require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 8080;
const DATA_FILE = path.join(__dirname, 'urls.json');

// Configure domain handling for Railway
const getDomain = () => {
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return ''; // Use relative URLs on Railway
  }
  return process.env.DOMAIN || 'http://localhost:8080';
};

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));
const validCredentials = {
    username: process.env.ADMIN_USER || 'siavash',
    password: process.env.ADMIN_PASS || '@Ss112233'
};
app.post('/login', express.json(), (req, res) => {
    const { username, password } = req.body;
    
    if (username === validCredentials.username && password === validCredentials.password) {
        req.session.authenticated = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ 
            success: false, 
            message: 'Invalid username or password' 
        });
    }
});
const requireAuth = (req, res, next) => {
    if (req.path === '/index1.html' && !req.session.authenticated) {
        return res.redirect('/');
    }
    next();
};

app.use(requireAuth);
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

// API Endpoint
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

    const domain = getDomain();
    res.json({
      originalUrl,
      shortUrl: domain ? `${domain}/${shortId}` : `/${shortId}`,
      shortId
    });
  } catch (error) {
    console.error('Shorten error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Redirect Endpoint - Fixed to handle Railway routing
app.get('/:shortId', async (req, res) => {
  try {
    const { shortId } = req.params;
    console.log(`Attempting redirect for: ${shortId}`);
    
    const db = await loadDatabase();
    if (db[shortId]) {
      console.log(`Redirecting to: ${db[shortId]}`);
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
    domain: getDomain(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Configured domain: ${getDomain() || 'Using relative URLs'}`);
});