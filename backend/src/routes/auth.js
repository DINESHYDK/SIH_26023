const express = require('express');
const router = express.Router();
const { register, login, googleLogin, getMe, logout } = require('../controllers/authController');
const { protect, authRateLimiter } = require('../middleware/auth');
const { validate, registerSchema, loginSchema, googleAuthSchema } = require('../validators/authValidator');

router.post('/register', authRateLimiter, validate(registerSchema), register);
router.post('/login', authRateLimiter, validate(loginSchema), login);
router.post('/google', authRateLimiter, validate(googleAuthSchema), googleLogin);
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);

module.exports = router;
