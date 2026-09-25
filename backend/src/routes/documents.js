const express = require('express');
const router = express.Router();
const { uploadDocument, getDocuments, deleteDocument } = require('../controllers/documentController');
const upload = require('../middleware/upload');
const { protect, setOptionalUser } = require('../middleware/auth');

// Max files accepted in one batch upload
const MAX_FILES_PER_UPLOAD = 10;

// GET /api/v1/documents - Fetch sidebar documents for user
router.get('/', protect, getDocuments);

// POST /api/v1/documents/upload - Upload and proxy to ML service
// Accepts the legacy single `file` field and/or repeated `files` fields.
// Multer rejections (bad type, too large, too many) become JSON errors instead of an HTML 500 page
const handleUpload = (req, res, next) => {
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'files', maxCount: MAX_FILES_PER_UPLOAD },
  ])(req, res, (err) => {
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

// DELETE /api/v1/documents/:id - Delete an owned document
router.delete('/:id', protect, deleteDocument);

module.exports = router;
