const mongoose = require('mongoose');

const folderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  documentIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
  }],
}, { timestamps: true });

const Folder = mongoose.model('Folder', folderSchema);
module.exports = Folder;
