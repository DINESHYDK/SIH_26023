const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();
const connectDB = require('./config/db');

const documentRoutes = require('./routes/documents');
const reportRoutes = require('./routes/reports');
const queryRoutes = require('./routes/query');
const authRoutes = require('./routes/auth');

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'CMPDI GeoReport API Gateway', timestamp: new Date().toISOString() });
});

if(process.env.NODE_ENV !== 'test'){
  app.listen(PORT, () => {
    console.log(`Backend API Gateway running on port ${PORT}`);
  });
}

module.exports = app;
