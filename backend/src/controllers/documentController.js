const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const Document = require('../models/Document');
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

const uploadDocument = async (req, res) => {
  let docRecord = null;
  
  try{
    if(!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { originalname, path: tempPath, size } = req.file;

    // Create tracking document in DB if user is authenticated
    if (req.user) {
      docRecord = await Document.create({
        userId: req.user._id,
        fileName: originalname,
        fileSize: size,
        status: 'processing'
      });
    }

    // Forward to ML service
    try{
      const formData = new FormData();
      formData.append('file', fs.createReadStream(tempPath), originalname);

      const mlResponse = await axios.post(`${ML_SERVICE_URL}/process-document`,
        formData, { headers: formData.getHeaders(), timeout: 120000 }
      );

      // Clean up temp file
      fs.unlink(tempPath, () => {});

      const mlData = mlResponse.data;

      // A 2xx body that isn't a JSON object (e.g. an HTML error page) is a failed ML call, not a report
      if (!mlData || typeof mlData !== 'object' || Array.isArray(mlData)) {
        if (docRecord) {
          docRecord.status = 'failed';
          await docRecord.save();
        }
        return res.status(502).json({
          success: false,
          message: 'The ML service returned an unexpected response.',
          error: 'Malformed ML response',
        });
      }

      // Update DB record if it exists
      if (docRecord) {
        docRecord.status = 'completed';
        if (mlData.summary) docRecord.summary = mlData.summary;
        if (mlData.kpis) docRecord.kpis = mlData.kpis;
        if (mlData.wordcloud) docRecord.wordCloud = mlData.wordcloud;
        if (mlData.topics) docRecord.topics = mlData.topics;
        // Persist the ML service's own id so /query can find this document
        // again later (its context_doc validation requires this id, not _id).
        if (mlData.document_id) docRecord.mlDocumentId = mlData.document_id;
        await docRecord.save();
      }

      return res.json({
        ...mlData,
        fileName: originalname,
        size,
        documentId: docRecord ? docRecord._id : null,
        ...buildUploadPayload({ mlData, fileName: originalname, size, docRecord }),
      });
    }
    catch(mlError){
      // Clean up temp file
      fs.unlink(tempPath, () => {});

      if (mlError.response) {
        // The request was made and the ML server responded with a status code outside 2xx
        if (docRecord) {
          docRecord.status = 'failed';
          await docRecord.save();
        }
        return res.status(mlError.response.status).json({
          success: false,
          message: mlErrorMessage(mlError.response.data, 'The document could not be processed.'),
          error: 'ML service error',
          details: mlError.response.data || mlError.message
        });
      } else {
        // ML service unavailable (network error, timeout, etc.) - return file metadata only
        if (docRecord) {
          docRecord.status = 'failed';
          await docRecord.save();
        }

        const fallback = buildUploadPayload({ mlData: {}, fileName: originalname, size, docRecord });
        fallback.document.status = 'demo';
        return res.json({
          fileName: originalname,
          size,
          documentId: docRecord ? docRecord._id : null,
          offline: true,
          ...fallback,
          message: 'Document uploaded (ML service unavailable - offline mode)',
        });
      }
    }
  } 
  catch(error){
    console.error('Upload error:', error);
    if (docRecord) {
      docRecord.status = 'failed';
      await docRecord.save().catch(e => console.error('Failed to update doc status:', e));
    }
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

module.exports = { uploadDocument, getDocuments };