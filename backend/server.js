const express = require('express');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

const app = express();
// Use port 5001 to avoid conflict with macOS AirPlay Receiver on port 5000
const PORT = process.env.PORT || 5001;

// Middleware - CORS configuration to allow requests from frontend
// More permissive CORS for development to handle all cases
const corsOptions = {
  origin: function (origin, callback) {
    // Allow all origins in development - no restrictions
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400 // 24 hours
};

// Helper function to set CORS headers on responses
const setCorsHeaders = (req, res) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  }
};

// Apply CORS middleware first, before any other middleware
app.use(cors(corsOptions));

// Request logging middleware (after CORS)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`, {
    origin: req.headers.origin || 'no origin',
    'content-type': req.headers['content-type'] || 'no content-type',
    'user-agent': req.headers['user-agent']?.substring(0, 50) || 'no user-agent',
    protocol: req.protocol,
    secure: req.secure,
    host: req.get('host')
  });
  next();
});

// Handle preflight requests explicitly for all routes
app.options('*', (req, res) => {
  console.log('OPTIONS preflight request:', req.path);
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400');
  res.sendStatus(200);
});

app.use(express.json());

// Root route - handle direct browser access
app.get('/', (req, res) => {
  setCorsHeaders(req, res);
  res.json({
    message: 'Campaign Analytics API Server',
    status: 'running',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      uploadCampaign: 'POST /campaigns/',
      getCampaigns: 'GET /campaigns/',
      getCampaign: 'GET /campaigns/:id',
      getAverageEngagementRate: 'GET /campaigns/:id/average-engagement-rate'
    },
    timestamp: new Date().toISOString()
  });
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only CSV files
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// In-memory storage for campaigns (in production, use a database)
let campaigns = [];

// Helper function to parse CSV file
function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    const cleanup = () => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        console.error('Error cleaning up file:', err);
      }
    };

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        cleanup();
        resolve(results);
      })
      .on('error', (error) => {
        cleanup();
        reject(error);
      });
  });
}

// Helper function to calculate average engagement rate
function calculateAverageEngagementRate(posts) {
  if (!posts || posts.length === 0) return 0;
  
  const totalEngagementRate = posts.reduce((sum, post) => {
    const engagementRate = parseFloat(post.engagement_rate) || 0;
    return sum + engagementRate;
  }, 0);
  
  return (totalEngagementRate / posts.length).toFixed(4);
}

// Health check endpoint - MUST be before POST /campaigns/
app.get('/health', (req, res) => {
  setCorsHeaders(req, res);
  res.json({ 
    status: 'ok', 
    message: 'Backend server is running',
    timestamp: new Date().toISOString(),
    port: PORT,
    uptime: process.uptime()
  });
});

// POST /campaigns/ - Upload and parse CSV file
app.post('/campaigns/', upload.single('file'), async (req, res) => {
  // Set CORS headers explicitly for this response
  setCorsHeaders(req, res);
  
  try {
    const origin = req.headers.origin;
    console.log('=== Upload Request Received ===');
    console.log('Request details:', {
      hasFile: !!req.file,
      file: req.file ? { 
        name: req.file.originalname, 
        size: req.file.size,
        mimetype: req.file.mimetype,
        fieldname: req.file.fieldname
      } : null,
      body: req.body,
      origin: origin,
      method: req.method,
      url: req.url,
      headers: {
        'content-type': req.headers['content-type'],
        'content-length': req.headers['content-length']
      }
    });

    if (!req.file) {
      console.error('No file in request');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Parse CSV file
    const posts = await parseCSV(req.file.path);
    
    // Check if file is empty
    if (!posts || posts.length === 0) {
      // Ensure CORS headers are set before sending error response
      setCorsHeaders(req, res);
      return res.status(400).json({ error: 'CSV file is empty' });
    }

    // Validate that we have at least the fields we need for display
    // But be flexible - accept any CSV structure as long as it has our required fields
    const requiredFields = ['engagement_rate', 'media_type', 'followers_gained', 'shares', 'saves'];
    const firstPost = posts[0];
    
    // Normalize field names (trim whitespace)
    const normalizeFieldName = (name) => name.trim().toLowerCase();
    const normalizedFields = {};
    Object.keys(firstPost).forEach(key => {
      normalizedFields[normalizeFieldName(key)] = key;
    });
    
    const missingFields = requiredFields.filter(field => {
      const fieldNormalized = normalizeFieldName(field);
      const hasField = field in firstPost || normalizedFields[fieldNormalized] !== undefined;
      return !hasField;
    });

    if (missingFields.length > 0) {
      console.log('Available fields in CSV:', Object.keys(firstPost));
      // Ensure CORS headers are set before sending error response
      setCorsHeaders(req, res);
      return res.status(400).json({ 
        error: `Missing required fields: ${missingFields.join(', ')}. Available fields: ${Object.keys(firstPost).join(', ')}` 
      });
    }

    // Helper function to get field value (case-insensitive, handles whitespace)
    const getField = (post, fieldName) => {
      const exactMatch = post[fieldName];
      if (exactMatch !== undefined) return exactMatch;
      
      const fieldNormalized = fieldName.trim().toLowerCase();
      const key = Object.keys(post).find(k => k.trim().toLowerCase() === fieldNormalized);
      return key ? post[key] : undefined;
    };

    // Create campaign object - store all fields but extract what we need
    const campaign = {
      id: campaigns.length + 1,
      posts: posts.map((post, index) => {
        // Use post_id from CSV if available, otherwise use index
        const postId = getField(post, 'post_id') || (index + 1);
        
        return {
          id: postId,
          // Store all original fields
          post_id: getField(post, 'post_id') || postId,
          upload_date: getField(post, 'upload_date') || '',
          media_type: getField(post, 'media_type') || '',
          likes: parseInt(getField(post, 'likes')) || 0,
          comments: parseInt(getField(post, 'comments')) || 0,
          shares: parseInt(getField(post, 'shares')) || 0,
          saves: parseInt(getField(post, 'saves')) || 0,
          reach: parseInt(getField(post, 'reach')) || 0,
          impressions: parseInt(getField(post, 'impressions')) || 0,
          caption_length: parseInt(getField(post, 'caption_length')) || 0,
          hashtags_count: parseInt(getField(post, 'hashtags_count')) || 0,
          followers_gained: parseInt(getField(post, 'followers_gained')) || 0,
          traffic_source: getField(post, 'traffic_source') || '',
          engagement_rate: parseFloat(getField(post, 'engagement_rate')) || 0,
          content_category: getField(post, 'content_category') || ''
        };
      }),
      createdAt: new Date().toISOString()
    };

    campaigns.push(campaign);

    console.log('✅ Campaign processed successfully:', {
      campaignId: campaign.id,
      postsCount: campaign.posts.length
    });

    res.json({
      message: 'Campaign uploaded successfully',
      campaign: campaign
    });
  } catch (error) {
    console.error('Error processing campaign:', error);
    // Clean up file if it still exists
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError);
      }
    }
    
    // Ensure CORS headers are set before sending error response
    setCorsHeaders(req, res);
    
    // Handle multer errors
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 10MB' });
      }
      return res.status(400).json({ error: `Upload error: ${error.message}` });
    }
    
    res.status(500).json({ error: `Failed to process campaign file: ${error.message}` });
  }
});

// Error handling middleware for multer - must include CORS headers
app.use((error, req, res, next) => {
  // Set CORS headers for error responses
  setCorsHeaders(req, res);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB' });
    }
    return res.status(400).json({ error: `Upload error: ${error.message}` });
  }
  if (error) {
    return res.status(400).json({ error: error.message });
  }
  next();
});

// GET /campaigns/:id - Get specific campaign
app.get('/campaigns/:id', (req, res) => {
  setCorsHeaders(req, res);
  const campaign = campaigns.find(c => c.id === parseInt(req.params.id));
  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found' });
  }
  res.json(campaign);
});

// GET /campaigns/ - Get all campaigns
app.get('/campaigns/', (req, res) => {
  setCorsHeaders(req, res);
  res.json(campaigns);
});

// GET /campaigns/:id/average-engagement-rate - Get average engagement rate
app.get('/campaigns/:id/average-engagement-rate', (req, res) => {
  setCorsHeaders(req, res);
  const campaign = campaigns.find(c => c.id === parseInt(req.params.id));
  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found' });
  }
  
  const averageEngagementRate = calculateAverageEngagementRate(campaign.posts);
  res.json({ averageEngagementRate: parseFloat(averageEngagementRate) });
});

// Start server - bind to all interfaces (0.0.0.0) to allow connections
app.listen(PORT, '0.0.0.0', () => {
  console.log(`========================================`);
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Accessible at:`);
  console.log(`   - http://localhost:${PORT}`);
  console.log(`   - http://127.0.0.1:${PORT}`);
  console.log(`🌐 CORS enabled for:`);
  console.log(`   - http://localhost:3000`);
  console.log(`   - http://localhost:3001`);
  console.log(`========================================`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  console.log(`✅ API info: http://localhost:${PORT}/`);
  console.log(`========================================`);
});

