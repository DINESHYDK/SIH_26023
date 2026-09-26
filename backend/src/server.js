const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();
const connectDB = require('./config/db');

const documentRoutes = require('./routes/documents');
const reportRoutes = require('./routes/reports');
const queryRoutes = require('./routes/query');
const authRoutes = require('./routes/auth');
const folderRoutes = require('./routes/folders');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to database
// don't exit process in tests if DB connection fails
if(process.env.NODE_ENV !== 'test'){
  connectDB();
}

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/documents', documentRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/query', queryRoutes);
app.use('/api/v1/folders', folderRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'CMPDI GeoReport API Gateway', timestamp: new Date().toISOString() });
});

if(process.env.NODE_ENV !== 'test'){
  const server = app.listen(PORT, () => {
    console.log(`Backend API Gateway running on port ${PORT}`);
  });
  // Node's default 5-minute requestTimeout would cut off scanned-PDF uploads
  // that are still backing off on Gemini 429/503s (see ML_UPLOAD_TIMEOUT_MS).
  server.requestTimeout = (Number(process.env.ML_UPLOAD_TIMEOUT_MS) || 15 * 60 * 1000) + 60 * 1000;
}

module.exports = app;
