const PDFDocument = require('pdfkit');
const crypto = require('crypto');

/**
 * Computes a deterministic SHA-256 integrity hash of the document's
 * analytical content fields: fileName, summary, kpis, topics.
 *
 * Fields included in hash (in order):
 *   - doc.fileName
 *   - doc.summary
 *   - JSON.stringify(doc.kpis)
 *   - JSON.stringify(doc.topics)
 *   - doc.uploadedAt (ISO string)
 *
 * The hash is an integrity fingerprint of the stored analytics, NOT a
 * cryptographic signature of the original file.
 */
function computeDocumentHash(doc) {
  const payload = [
    doc.fileName || '',
    doc.summary || '',
    JSON.stringify(doc.kpis || {}),
    JSON.stringify(doc.topics || []),
    doc.uploadedAt ? new Date(doc.uploadedAt).toISOString() : '',
  ].join('|');

  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Generate a PDF docket buffer for a given Document record.
 * Returns a Promise that resolves to a Buffer containing the PDF bytes.
 *
 * @param {Object} doc - Mongoose Document instance (or plain object with same shape)
 * @param {Object} user - Mongoose User instance (only safe fields used)
 */
function generateDocumentPDF(doc, user) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];

    pdf.on('data', (chunk) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', (err) => reject(err));

    const integrityHash = computeDocumentHash(doc);
    const exportedAt = new Date().toISOString();

    // ── Header ─────────────────────────────────────────────────────────
    pdf
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('CMPDI GeoReport AI', { align: 'center' })
      .moveDown(0.3)
      .fontSize(11)
      .font('Helvetica')
      .text('Central Mine Planning & Design Institute — SIH 2026 (PS #26023)', { align: 'center' })
      .moveDown(0.3)
      .fontSize(10)
      .fillColor('#555555')
      .text('Document Analysis Export Docket', { align: 'center' })
      .fillColor('#000000')
      .moveDown(1);

    // ── Divider ─────────────────────────────────────────────────────────
    pdf
      .moveTo(50, pdf.y)
      .lineTo(545, pdf.y)
      .strokeColor('#cccccc')
      .stroke()
      .moveDown(0.8);

    // ── Document Metadata ───────────────────────────────────────────────
    pdf.fontSize(13).font('Helvetica-Bold').text('Document Metadata').moveDown(0.4);

    const metaRows = [
      ['File Name', doc.fileName],
      ['File Size', doc.fileSize ? `${(doc.fileSize / 1024).toFixed(1)} KB` : 'N/A'],
      ['Uploaded At', doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST' : 'N/A'],
      ['Analysis Status', doc.status || 'N/A'],
      ['Exported At', new Date(exportedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST'],
      ['Exported By', user.name || 'N/A'],
    ];

    pdf.fontSize(10).font('Helvetica');
    for (const [label, value] of metaRows) {
      pdf
        .font('Helvetica-Bold').text(`${label}: `, { continued: true })
        .font('Helvetica').text(String(value ?? 'N/A'));
    }

    pdf.moveDown(1);

    // ── Divider ─────────────────────────────────────────────────────────
    pdf
      .moveTo(50, pdf.y)
      .lineTo(545, pdf.y)
      .strokeColor('#cccccc')
      .stroke()
      .moveDown(0.8);

    // ── Summary ──────────────────────────────────────────────────────────
    pdf.fontSize(13).font('Helvetica-Bold').text('AI-Generated Summary').moveDown(0.4);
    pdf.fontSize(10).font('Helvetica');

    if (doc.summary && doc.summary.trim()) {
      pdf.text(doc.summary, { align: 'justify' });
    } else {
      pdf.fillColor('#888888').text('No summary available for this document.').fillColor('#000000');
    }

    pdf.moveDown(1);

    // ── KPIs ─────────────────────────────────────────────────────────────
    if (doc.kpis && Object.keys(doc.kpis).length > 0) {
      pdf
        .moveTo(50, pdf.y).lineTo(545, pdf.y).strokeColor('#cccccc').stroke()
        .moveDown(0.8);

      pdf.fontSize(13).font('Helvetica-Bold').text('Key Performance Indicators').moveDown(0.4);
      pdf.fontSize(10).font('Helvetica');

      for (const [key, value] of Object.entries(doc.kpis)) {
        const displayKey = key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
        const displayVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
        pdf
          .font('Helvetica-Bold').text(`${displayKey}: `, { continued: true })
          .font('Helvetica').text(displayVal);
      }

      pdf.moveDown(1);
    }

    // ── Topics ────────────────────────────────────────────────────────────
    if (doc.topics && doc.topics.length > 0) {
      pdf
        .moveTo(50, pdf.y).lineTo(545, pdf.y).strokeColor('#cccccc').stroke()
        .moveDown(0.8);

      pdf.fontSize(13).font('Helvetica-Bold').text('Identified Topics').moveDown(0.4);
      pdf.fontSize(10).font('Helvetica');

      for (const topic of doc.topics) {
        if (typeof topic === 'string') {
          pdf.text(`• ${topic}`);
        } else if (topic && topic.name) {
          const status = topic.status ? ` — ${topic.status}` : '';
          pdf.text(`• ${topic.name}${status}`);
        }
      }

      pdf.moveDown(1);
    }

    // ── Integrity Footer ──────────────────────────────────────────────────
    pdf
      .moveTo(50, pdf.y).lineTo(545, pdf.y).strokeColor('#cccccc').stroke()
      .moveDown(0.8);

    pdf.fontSize(11).font('Helvetica-Bold').text('Document Integrity Fingerprint').moveDown(0.4);
    pdf
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#444444')
      .text(
        'SHA-256 hash of: fileName | summary | kpis (JSON) | topics (JSON) | uploadedAt',
        { align: 'left' }
      )
      .moveDown(0.3)
      .fontSize(9)
      .font('Courier')
      .fillColor('#000000')
      .text(integrityHash, { align: 'left' })
      .moveDown(0.5)
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#888888')
      .text(
        'Note: This hash is an integrity fingerprint of the stored analytical content, not a cryptographic signature.',
        { align: 'left' }
      )
      .fillColor('#000000');

    pdf.end();
  });
}

module.exports = { generateDocumentPDF, computeDocumentHash };
