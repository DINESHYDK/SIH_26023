
const mongoose = require('mongoose');
const Document = require('../models/Document');
const { generateDocumentPDF, computeDocumentHash } = require('../services/pdfService');

const buildMockReport = () => {
  const mockReport = {
    dataMode: 'demo',
    metadata: {
      reportId: 'BCCL-JHARIA-Q3-FY2025-26',
      title: 'BCCL Jharia Opencast — Quarterly Geological & Production Report',
      subsidiary: 'BCCL',
      region: 'Jharia Coalfield',
      period: 'Q3 FY2025-26',
      preparedBy: 'CMPDI Regional Institute',
      classification: 'Internal',
    },
    subsidiary: 'BCCL',
    region: 'Jharia Coalfield',
    reportTitle: 'BCCL Jharia Opencast — Quarterly Geological & Production Report (Q3 FY2025-26)',
    generatedAt: new Date().toISOString(),
    summary:
      'Bharat Coking Coal Limited (BCCL) operations in the Jharia Coalfield reported aggregate coal production of 14.82 Million Tonnes (MT) for Q3 FY2025-26, reflecting a 6.2% year-over-year increase. Overburden removal reached 32.14 Million Cubic Metres (M.Cu.M), maintaining the composite stripping ratio at 2.16 against a target of 2.10. Geological surveys of Seams X, XI, and XII indicate inferred reserves of approximately 184.5 MT of coking coal.',
    kpis: {
      coalProductionMT: 14.82,
      coalProductionTargetMT: 13.95,
      yoyGrowthPercent: 6.2,
      overburdenRemovalMCuM: 32.14,
      strippingRatio: 2.16,
      strippingRatioTarget: 2.10,
      inferredReservesMT: 184.5,
      activeSeams: ['Seam X', 'Seam XI', 'Seam XII'],
    },
    wordcloud: [
      { value: 'Overburden', count: 64 },
      { value: 'Stripping Ratio', count: 48 },
      { value: 'Coking Coal', count: 42 },
      { value: 'Opencast', count: 39 },
      { value: 'Seam XII', count: 31 },
      { value: 'Beneficiation', count: 28 },
      { value: 'HEMM', count: 25 },
      { value: 'Methane Drainage', count: 22 },
      { value: 'Borehole', count: 19 },
      { value: 'Lithology', count: 17 },
      { value: 'Pit Production', count: 15 },
      { value: 'Environmental Clearance', count: 14 },
      { value: 'Strata Control', count: 12 },
      { value: 'Coal Washing', count: 11 },
      { value: 'Fly Ash', count: 9 },
    ],
    topics: [
      { name: 'Strata Stability', status: 'High Stability', sentiment: 'positive' },
      { name: 'Environmental Clearance', status: 'Pending MoEFCC', sentiment: 'warning' },
      { name: 'Fly Ash Disposal', status: 'Compliant', sentiment: 'positive' },
      { name: 'Methane Drainage', status: 'Operational', sentiment: 'positive' },
      { name: 'HEMM Utilization', status: '87% Uptime', sentiment: 'neutral' },
      { name: 'Seam XII Exploration', status: 'In Progress', sentiment: 'neutral' },
    ],
    productionByPit: [
      { pit: 'Pit 1', targetMT: 2.80, actualMT: 2.92 },
      { pit: 'Pit 2', targetMT: 2.50, actualMT: 2.41 },
      { pit: 'Pit 3', targetMT: 2.10, actualMT: 2.25 },
      { pit: 'Pit 4', targetMT: 2.60, actualMT: 2.53 },
      { pit: 'Pit 5', targetMT: 2.20, actualMT: 2.38 },
      { pit: 'Pit 6', targetMT: 1.75, actualMT: 2.33 },
    ],
    executiveReport: {
      sections: [
        {
          title: '1. Executive Abstract',
          content: 'BCCL Jharia Opencast operations achieved 14.82 MT coal production in Q3, exceeding the 13.95 MT target by 6.2%. Overburden removal operations maintained pace at 32.14 M.Cu.M with a composite stripping ratio of 2.16.',
        },
        {
          title: '2. Lithological Stratigraphy',
          content: 'Geological surveys across Seams X, XI, and XII confirm inferred coking coal reserves of 184.5 MT. Borehole analysis at depths 180-320m reveals consistent coal band thickness of 2.8-4.2m with intermittent sandstone and shale partings.',
        },
        {
          title: '3. Production Impediments',
          content: 'Monsoon-related water ingress in Pit 2 caused a 3.6% shortfall against target. HEMM downtime due to scheduled maintenance in Pit 4 impacted OBR rates during Week 28-30.',
        },
        {
          title: '4. Recommendations',
          content: 'Expedite MoEFCC environmental clearance for Seam XII expansion. Augment dewatering infrastructure at Pit 2. Commission additional dragline capacity for Pit 6 to sustain OBR momentum into Q4.',
        },
      ],
    },
  };

  return mockReport;
};

const getMockReport = (req, res) => res.json(buildMockReport());

/**
 * GET /api/v1/reports/:id/export-pdf
 *
 * Exports a PDF docket for the authenticated user's uploaded document.
 * Authorization: Bearer token required. Document must belong to req.user.
 */
const exportDocumentPDF = async (req, res) => {
  const { id } = req.params;

  // Validate MongoDB ObjectId format upfront
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, error: 'Invalid document ID format.' });
  }

  let doc;
  try {
    doc = await Document.findById(id).lean();
  } catch (dbError) {
    console.error('PDF export DB error:', dbError);
    return res.status(500).json({ success: false, error: 'Database error while retrieving document.' });
  }

  if (!doc) {
    return res.status(404).json({ success: false, error: 'Document not found.' });
  }

  // Authorization: enforce user ownership
  if (doc.userId.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, error: 'Access denied. You do not own this document.' });
  }

  let pdfBuffer;
  try {
    pdfBuffer = await generateDocumentPDF(doc, req.user);
  } catch (pdfError) {
    console.error('PDF generation error:', pdfError);
    return res.status(500).json({ success: false, error: 'Failed to generate PDF.' });
  }

  // Safe filename: strip path chars, fallback if empty
  const safeName = (doc.fileName || 'document').replace(/[^a-z0-9_\-\.]/gi, '_');
  const exportName = `cmpdi_docket_${safeName}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${exportName}"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.setHeader('X-Document-Id', doc._id.toString());
  res.setHeader('X-Integrity-Hash', computeDocumentHash(doc));

  return res.send(pdfBuffer);
};

module.exports = { getMockReport, buildMockReport, exportDocumentPDF };
