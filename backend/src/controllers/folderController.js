const mongoose = require('mongoose');
const Folder = require('../models/Folder');
const Document = require('../models/Document');

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const fail = (res, status, error) => res.status(status).json({ success: false, error });

// Load a folder and enforce ownership. Sends the error response and returns null on failure.
const loadOwnedFolder = async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    fail(res, 400, 'Invalid folder ID format.');
    return null;
  }
  const folder = await Folder.findById(id);
  if (!folder) {
    fail(res, 404, 'Folder not found.');
    return null;
  }
  if (folder.userId.toString() !== req.user._id.toString()) {
    fail(res, 403, 'Access denied. You do not own this folder.');
    return null;
  }
  return folder;
};

// Returns the ids only if every one is valid and owned by the user, otherwise null
const resolveOwnedDocumentIds = async (ids, userId) => {
  const unique = [...new Set(ids.map(String))];
  if (!unique.every(isValidId)) return null;
  const count = await Document.countDocuments({ _id: { $in: unique }, userId });
  return count === unique.length ? unique : null;
};

// GET /api/v1/folders
const listFolders = async (req, res) => {
  try {
    const folders = await Folder.find({ userId: req.user._id }).sort({ updatedAt: -1 }).select('-__v');
    return res.json({ success: true, count: folders.length, folders });
  } catch (error) {
    console.error('List folders error:', error);
    return fail(res, 500, 'Failed to fetch folders.');
  }
};

// POST /api/v1/folders
const createFolder = async (req, res) => {
  try {
    const folder = await Folder.create({ userId: req.user._id, name: req.body.name });
    return res.status(201).json({ success: true, folder });
  } catch (error) {
    console.error('Create folder error:', error);
    return fail(res, 500, 'Failed to create folder.');
  }
};

// GET /api/v1/folders/:id  (documents populated)
const getFolder = async (req, res) => {
  try {
    const folder = await loadOwnedFolder(req, res);
    if (!folder) return;
    await folder.populate({ path: 'documentIds', select: '-__v' });
    return res.json({ success: true, folder });
  } catch (error) {
    console.error('Get folder error:', error);
    return fail(res, 500, 'Failed to fetch folder.');
  }
};

// PATCH /api/v1/folders/:id  { name?, addDocumentIds?, removeDocumentIds? }
const updateFolder = async (req, res) => {
  try {
    const folder = await loadOwnedFolder(req, res);
    if (!folder) return;

    const { name, addDocumentIds, removeDocumentIds } = req.body;

    if (addDocumentIds && addDocumentIds.length) {
      // Only documents the user owns may be added
      const ids = await resolveOwnedDocumentIds(addDocumentIds, req.user._id);
      if (!ids) return fail(res, 404, 'One or more documents were not found.');
      await Folder.updateOne({ _id: folder._id }, { $addToSet: { documentIds: { $each: ids } } });
    }
    if (removeDocumentIds && removeDocumentIds.length) {
      const ids = removeDocumentIds.map(String).filter(isValidId);
      await Folder.updateOne({ _id: folder._id }, { $pull: { documentIds: { $in: ids } } });
    }
    if (name !== undefined) {
      await Folder.updateOne({ _id: folder._id }, { $set: { name } });
    }

    const updated = await Folder.findById(folder._id).populate({ path: 'documentIds', select: '-__v' });
    return res.json({ success: true, folder: updated });
  } catch (error) {
    console.error('Update folder error:', error);
    return fail(res, 500, 'Failed to update folder.');
  }
};

// DELETE /api/v1/folders/:id  - removes the folder only, never the documents in it
const deleteFolder = async (req, res) => {
  try {
    const folder = await loadOwnedFolder(req, res);
    if (!folder) return;
    await Folder.deleteOne({ _id: folder._id });
    return res.json({ success: true, message: 'Folder deleted. Its documents were not deleted.' });
  } catch (error) {
    console.error('Delete folder error:', error);
    return fail(res, 500, 'Failed to delete folder.');
  }
};

module.exports = { listFolders, createFolder, getFolder, updateFolder, deleteFolder };
