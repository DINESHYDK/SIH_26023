const mongoose = require('mongoose');

const citationSchema = new mongoose.Schema({
  page: Number,
  source: String
}, { _id: false });

const queryHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  query: {
    type: String,
    required: true,
  },
  answer: {
    type: String,
    required: true,
  },
  citations: {
    type: [citationSchema],
    default: [],
  },
  contextDoc: {
    type: String,
    default: '',
  },
  timestamp: {
    type: Date,
    default: Date.now,
  }
}, { timestamps: true });

queryHistorySchema.index({ userId: 1, timestamp: -1 });

const QueryHistory = mongoose.model('QueryHistory', queryHistorySchema);
module.exports = QueryHistory;
