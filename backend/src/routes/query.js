const express = require('express');
const router = express.Router();
const { forwardQuery, getHistory } = require('../controllers/queryController');
const { protect, setOptionalUser } = require('../middleware/auth');

// GET /api/v1/query/history
router.get('/history', protect, getHistory);

// POST /api/v1/query
router.post('/', setOptionalUser, forwardQuery);

module.exports = router;
