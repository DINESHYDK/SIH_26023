const express = require('express');
const router = express.Router();
const { uploadDocument, getDocuments } = require('../controllers/documentController');
const upload = require('../middleware/upload');
const { protect, setOptionalUser } = require('../middleware/auth');

// GET /api/v1/documents - Fetch sidebar documents for user
router.get('/', protect, getDocuments);

// POST /api/v1/documents/upload - Upload and proxy to ML service
router.post('/upload', setOptionalUser, upload.single('file'), uploadDocument);

module.exports = router;
