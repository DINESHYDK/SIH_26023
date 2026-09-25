const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  fileName: {
    type: String,
    required: true,
    trim: true,
  },
  fileSize: {
    type: Number,
    default: 0,
  },
  // The ML service's own content-hash id (16 hex chars) — distinct from this
  // document's Mongo _id. /query's context_doc must be this id, not _id, so
  // it's persisted here once known to survive a page refresh / new session.
  mlDocumentId: {
    type: String,
    default: null,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
  summary: {
    type: String,
    default: '',
  },
  kpis: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  wordCloud: {
    type: Array,
    default: [],
  },
  topics: {
    type: Array,
    default: [],
  },
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed'],
    default: 'processing',
  }
}, { timestamps: true });

documentSchema.index({ userId: 1, uploadedAt: -1 });

const Document = mongoose.model('Document', documentSchema);
module.exports = Document;
