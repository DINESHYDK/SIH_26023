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
