const axios = require('axios');
const fs = require('fs');
const mongoose = require('mongoose');
const FormData = require('form-data');
const Document = require('../models/Document');
const Folder = require('../models/Folder');
const { buildMockReport } = require('./reportController');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// Extract a readable message from an ML service error body ({ detail: string | [...] })
const mlErrorMessage = (data, fallback) => {
  const detail = data && data.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(d => d.msg || JSON.stringify(d)).join('; ');
  return fallback;
};

// Shape the upload result the way the frontend expects: { message, document, report }.
// Analytics from the ML service are overlaid on the demo template when present.
const buildUploadPayload = ({ mlData, fileName, size, docRecord }) => {
  const base = buildMockReport();
  const hasAnalytics = !!(mlData.summary || mlData.kpis || mlData.wordcloud || mlData.topics);
  const report = {
    ...base,
    dataMode: hasAnalytics ? 'processed' : 'demo',
    metadata: {
      ...base.metadata,
      reportId: mlData.document_id || (docRecord ? String(docRecord._id) : base.metadata.reportId),
      title: fileName,
    },
    kpis: { ...base.kpis, ...(mlData.kpis || {}) },
    wordcloud: mlData.wordcloud || base.wordcloud,
    topics: mlData.topics || base.topics,
  };
  if (mlData.summary) {
    report.summary = mlData.summary;
    report.executiveReport = { sections: [{ title: '1. Executive Abstract', content: mlData.summary }] };
  }
  return {
    message: 'Document processed successfully',
    document: {
      id: mlData.document_id || (docRecord ? String(docRecord._id) : fileName),
      fileName,
      size,
      status: 'processed',
    },
    report,
  };
};

// Persist an ML result on the tracking record (no-op for guests)
const markCompleted = async (docRecord, mlData) => {
  if (!docRecord) return;
  docRecord.status = 'completed';
  if (mlData.summary) docRecord.summary = mlData.summary;
  if (mlData.kpis) docRecord.kpis = mlData.kpis;
  if (mlData.wordcloud) docRecord.wordCloud = mlData.wordcloud;
  if (mlData.topics) docRecord.topics = mlData.topics;
  // Persist the ML service's own id so /query can find this document
  // again later (its context_doc validation requires this id, not _id).
  if (typeof mlData.document_id === 'string' && mlData.document_id) docRecord.mlDocumentId = mlData.document_id;
  await docRecord.save();
};

const markFailed = async (docRecords) => {
  await Promise.all(docRecords.filter(Boolean).map(rec => {
    rec.status = 'failed';
    return rec.save();
  }));
};

// Files arrive as `file` (legacy single) and/or `files` (batch)
const collectFiles = (req) => {
  const uploaded = req.files || {};
  return [...(uploaded.file || []), ...(uploaded.files || [])];
};

const uploadDocument = async (req, res) => {
  const files = collectFiles(req);
  const cleanup = () => files.forEach(f => fs.unlink(f.path, () => {}));
  let docRecords = [];

  try{
    if(!files.length) return res.status(400).json({ error: 'No file uploaded' });

    const isBatch = files.length > 1;

    // Create tracking documents in DB if user is authenticated
    docRecords = req.user
      ? await Promise.all(files.map(f => Document.create({
          userId: req.user._id,
          fileName: f.originalname,
          fileSize: f.size,
          status: 'processing'
        })))
      : files.map(() => null);

    // Forward to ML service (one repeated `files` field per file)
    try{
      const formData = new FormData();
      files.forEach(f => formData.append('files', fs.createReadStream(f.path), f.originalname));

      const mlResponse = await axios.post(`${ML_SERVICE_URL}/process-document`,
        formData, { headers: formData.getHeaders(), timeout: 120000 }
      );

      // Clean up temp files
      cleanup();

      const mlData = mlResponse.data;

      // A 2xx body that isn't a JSON object (e.g. an HTML error page) is a failed ML call, not a report
      const malformed = !mlData || typeof mlData !== 'object' || Array.isArray(mlData)
        || (isBatch && (!Array.isArray(mlData.documents) || mlData.documents.length !== files.length));
      if (malformed) {
        await markFailed(docRecords);
        return res.status(502).json({
          success: false,
          message: 'The ML service returned an unexpected response.',
          error: 'Malformed ML response',
        });
      }

      if (!isBatch) {
        const { originalname, size } = files[0];
        const docRecord = docRecords[0];
        await markCompleted(docRecord, mlData);

        return res.json({
          ...mlData,
          fileName: originalname,
          size,
          documentId: docRecord ? docRecord._id : null,
          ...buildUploadPayload({ mlData, fileName: originalname, size, docRecord }),
        });
      }

      // Batch: ML returns { total, processed, failed, documents: [{ filename, status, result | error }] }
      // in upload order. Each file succeeds or fails independently.
      const documents = [];
      for (let i = 0; i < files.length; i++) {
        const item = mlData.documents[i] || {};
        const { originalname, size } = files[i];
        const docRecord = docRecords[i];
        const ok = item.status === 'processed' && item.result && typeof item.result === 'object';

        if (ok) {
          await markCompleted(docRecord, item.result);
          const { document, report } = buildUploadPayload({ mlData: item.result, fileName: originalname, size, docRecord });
          documents.push({
            fileName: originalname, size, documentId: docRecord ? docRecord._id : null,
            status: 'processed', document, report,
          });
        } else {
          await markFailed([docRecord]);
          documents.push({
            fileName: originalname, size, documentId: docRecord ? docRecord._id : null,
            status: item.status === 'rate_limited' ? 'rate_limited' : 'failed',
            error: (typeof item.error === 'string' && item.error) || 'The document could not be processed.',
          });
        }
      }
      const processed = documents.filter(d => d.status === 'processed').length;
      return res.json({
        message: `${processed} of ${files.length} documents processed`,
        total: files.length,
        processed,
        failed: files.length - processed,
        documents,
      });
    }
    catch(mlError){
      // Clean up temp files
      cleanup();

      if (mlError.response) {
        // The request was made and the ML server responded with a status code outside 2xx
        await markFailed(docRecords);
        return res.status(mlError.response.status).json({
          success: false,
          message: mlErrorMessage(mlError.response.data, 'The document could not be processed.'),
          error: 'ML service error',
          details: mlError.response.data || mlError.message
        });
      } else {
        // ML service unavailable (network error, timeout, etc.) - return file metadata only
        await markFailed(docRecords);

        const fallbacks = files.map((f, i) => {
          const fb = buildUploadPayload({ mlData: {}, fileName: f.originalname, size: f.size, docRecord: docRecords[i] });
          fb.document.status = 'demo';
          return { fileName: f.originalname, size: f.size, documentId: docRecords[i] ? docRecords[i]._id : null, ...fb };
        });

        if (!isBatch) {
          return res.json({
            ...fallbacks[0],
            offline: true,
            message: 'Document uploaded (ML service unavailable - offline mode)',
          });
        }
        return res.json({
          message: 'Documents uploaded (ML service unavailable - offline mode)',
          offline: true,
          total: files.length,
          processed: 0,
          failed: 0,
          documents: fallbacks.map(({ message, ...item }) => ({ ...item, status: 'demo' })),
        });
      }
    }
  }
  catch(error){
    console.error('Upload error:', error);
    cleanup();
    await markFailed(docRecords).catch(e => console.error('Failed to update doc status:', e));
    return res.status(500).json({ success: false, message: 'Upload failed. Please try again.', error: 'Upload failed', details: error.message });
  }
};

const getDocuments = async (req, res) => {
  try {
    const documents = await Document.find({ userId: req.user._id })
      .sort({ uploadedAt: -1 })
      .select('-__v'); // Exclude mongoose version key

    return res.json({
      success: true,
      count: documents.length,
      documents
    });
  } catch (error) {
    console.error('Fetch documents error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch documents' });
  }
};

// DELETE /api/v1/documents/:id - owner only; also unlinks it from the user's folders
const deleteDocument = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, error: 'Invalid document ID format.' });
  }

  try {
    const doc = await Document.findById(id).lean();
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found.' });
    }
    if (doc.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Access denied. You do not own this document.' });
    }

    await Document.deleteOne({ _id: doc._id });
    await Folder.updateMany({ userId: req.user._id, documentIds: doc._id }, { $pull: { documentIds: doc._id } });

    return res.json({ success: true, message: 'Document deleted.', id: String(doc._id) });
  } catch (error) {
    console.error('Delete document error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete document.' });
  }
};

module.exports = { uploadDocument, getDocuments, deleteDocument };
