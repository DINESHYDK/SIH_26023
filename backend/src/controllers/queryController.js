const axios = require('axios');
const QueryHistory = require('../models/QueryHistory');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// Distinct scanned pages whose images are attached to one answer.
const MAX_CITATION_IMAGES = 6;

/**
 * Parse the ML service's X-Citations header ([{page, source, document_id,
 * document_type, page_url?}]) into the frontend Citation shape. Scanned-page
 * citations get the Base64 page image that was sent to Gemini Vision, fetched
 * once per distinct page from the ML page endpoint. Image failures never fail
 * the answer; that citation just has no preview.
 */
const citationsFromHeader = async (header) => {
  let raw;
  try {
    raw = JSON.parse(header || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  const images = new Map();
  for (const item of raw) {
    if (item.page_url && !images.has(item.page_url) && images.size < MAX_CITATION_IMAGES) {
      images.set(item.page_url, null);
    }
  }
  await Promise.all([...images.keys()].map(async (pageUrl) => {
    try {
      const { data } = await axios.get(`${ML_SERVICE_URL}${pageUrl}`, { timeout: 15000 });
      images.set(pageUrl, { imageBase64: data.image_base64, imageMimeType: data.image_mime_type });
    } catch (error) {
      console.warn(`Citation image unavailable (${pageUrl}):`, error.message);
    }
  }));

  return raw.map((item) => ({
    source: item.source,
    page: item.page,
    documentId: item.document_id,
    documentType: item.document_type,
    ...(images.get(item.page_url) || {}),
  }));
};

const forwardQuery = async (req, res) => {
  try{
    const { query, context_doc } = req.body;

    if(!query) return res.status(400).json({ error: 'Query is required' });

    try{
      const mlResponse = await axios.post(`${ML_SERVICE_URL}/query`,
        { query, context_doc: context_doc || '' }, { timeout: 60000 }
      );
      
      let mlData = mlResponse.data;

      // Adapt plain text streaming response from ML service to expected JSON format.
      // Citations arrive separately in the X-Citations header.
      if (typeof mlData === 'string') {
        mlData = {
          answer: mlData,
          citations: await citationsFromHeader(mlResponse.headers['x-citations'])
        };
      }

      // Save successful query to history if user is authenticated
      if (req.user && mlData && !mlData.offline) {
        await QueryHistory.create({
          userId: req.user._id,
          query,
          answer: mlData.answer || '',
          citations: mlData.citations || [],
          contextDoc: context_doc || ''
        });
      }

      return res.json({ ...mlData, dataMode: 'processed' });
    } 
    catch(mlError){
      if (mlError.response) {
        // ML service responded with an error status (e.g. 4xx, 5xx)
        const d = mlError.response.data;
        return res.status(mlError.response.status).json({
          success: false,
          message: (d && typeof d.detail === 'string') ? d.detail : 'The query could not be processed.',
          error: 'ML service error',
          details: mlError.response.data || mlError.message
        });
      } else {
        // ML service unavailable - return offline fallback
        return res.json({
          answer: 'The ML service is currently offline. This is a fallback response. In production, this query would be processed by the Gemini-powered RAG pipeline with full source attribution.',
          citations: [],
          offline: true,
          dataMode: 'demo',
        });
      }
    }
  } 
  catch(error){
    console.error('Query error:', error);
    return res.status(500).json({ error: 'Query failed', details: error.message });
  }
};

const getHistory = async (req, res) => {
  try {
    const history = await QueryHistory.find({ userId: req.user._id })
      .sort({ timestamp: -1 })
      .select('-__v'); // Exclude mongoose version key
    
    return res.json({
      success: true,
      count: history.length,
      history
    });
  } catch (error) {
    console.error('Fetch query history error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch query history' });
  }
};

module.exports = { forwardQuery, getHistory };
