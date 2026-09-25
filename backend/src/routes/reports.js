const express = require('express');
const router = express.Router();
const { getMockReport, exportDocumentPDF } = require('../controllers/reportController');
const { protect } = require('../middleware/auth');

// GET /api/v1/reports/mock
router.get('/mock', getMockReport);

// GET /api/v1/reports/:id/export-pdf
router.get('/:id/export-pdf', protect, exportDocumentPDF);

module.exports = router;
