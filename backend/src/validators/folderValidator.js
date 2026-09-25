const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const createFolderSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
});

const updateFolderSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100),
  addDocumentIds: Joi.array().items(objectId).max(200),
  removeDocumentIds: Joi.array().items(objectId).max(200),
}).or('name', 'addDocumentIds', 'removeDocumentIds');

// Folder endpoints use the documents/reports error shape: { success: false, error: string }
const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed: ' + error.details.map(d => d.message).join('; '),
    });
  }
  req.body = value;
  next();
};

module.exports = { validate, createFolderSchema, updateFolderSchema };
