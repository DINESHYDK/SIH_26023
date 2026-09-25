const Joi = require('joi');

const registerSchema = Joi.object({
  name: Joi.string().min(2).max(50).required().messages({
    'string.base': 'Name should be a type of text',
    'string.empty': 'Name cannot be an empty field',
    'string.min': 'Name should have a minimum length of 2',
    'any.required': 'Name is a required field'
  }),
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is a required field'
  }),
  password: Joi.string().min(6).required().messages({
    'string.min': 'Password should have a minimum length of 6 characters',
    'any.required': 'Password is a required field'
  })
});

const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is a required field'
  }),
  password: Joi.string().required().messages({
    'any.required': 'Password is a required field'
  })
});

const googleAuthSchema = Joi.object({
  token: Joi.string().required().messages({
    'any.required': 'Google token is required'
  })
});

const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, { abortEarly: false });
  if(error){
    const errorDetails = error.details.map(detail => detail.message);
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      error: {
        code: 'VALIDATION_ERROR',
        details: errorDetails
      }
    });
  }
  next();
};

module.exports = { validate, registerSchema, loginSchema, googleAuthSchema };