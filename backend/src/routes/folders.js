const express = require('express');
const router = express.Router();
const { listFolders, createFolder, getFolder, updateFolder, deleteFolder } = require('../controllers/folderController');
const { protect } = require('../middleware/auth');
const { validate, createFolderSchema, updateFolderSchema } = require('../validators/folderValidator');

router.use(protect);

router.get('/', listFolders);
router.post('/', validate(createFolderSchema), createFolder);
router.get('/:id', getFolder);
router.patch('/:id', validate(updateFolderSchema), updateFolder);
router.delete('/:id', deleteFolder);

module.exports = router;
