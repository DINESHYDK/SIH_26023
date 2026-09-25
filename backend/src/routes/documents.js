const express = require('express');
const router = express.Router();
const { uploadDocument, getDocuments } = require('../controllers/documentController');
const upload = require('../middleware/upload');
const { protect, setOptionalUser } = require('../middleware/auth');

// GET /api/v1/documents - Fetch sidebar documents for user
router.get('/', protect, getDocuments);

// POST /api/v1/documents/upload - Upload and proxy to ML service
// Multer rejections (bad type, too large) become JSON errors instead of an HTML 500 page
const handleUpload = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 400).json({
      success: false,
      error: tooLarge ? 'File too large' : 'Upload rejected',
      message: tooLarge ? 'File exceeds the 50 MB limit.' : err.message,
    });
  });
};

router.post('/upload', setOptionalUser, handleUpload, uploadDocument);

module.exports = router;
