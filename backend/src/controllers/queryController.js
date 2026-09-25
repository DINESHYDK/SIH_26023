const axios = require('axios');
const QueryHistory = require('../models/QueryHistory');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

const forwardQuery = async (req, res) => {
  try{
    const { query, context_doc } = req.body;

    if(!query) return res.status(400).json({ error: 'Query is required' });

    try{
      const mlResponse = await axios.post(`${ML_SERVICE_URL}/query`,
        { query, context_doc: context_doc || '' }, { timeout: 60000 }
      );
      
      let mlData = mlResponse.data;

      // Adapt plain text streaming response from ML service to expected JSON format
      if (typeof mlData === 'string') {
        mlData = {
          answer: mlData,
          citations: []
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
