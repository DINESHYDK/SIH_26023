const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  if(req.headers.authorization && req.headers.authorization.startsWith('Bearer')){
    token = req.headers.authorization.split(' ')[1];
  }

  if(!token){
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no token provided',
      error: { code: 'UNAUTHORIZED_NO_TOKEN', details: [] }
    });
  }

  try{
    const secret = (process.env.JWT_SECRET && process.env.JWT_SECRET.trim()) || 'default_jwt_secret_dev_key';
    const decoded = jwt.verify(token, secret);
    const user = await User.findById(decoded.id).select('-password');
    
    if(!user){
      return res.status(401).json({
        success: false,
        message: 'User belonging to this token no longer exists',
        error: { code: 'UNAUTHORIZED_USER_DELETED', details: [] }
      });
    }

    req.user = user;
    next();
  } 
  catch(error){
    return res.status(401).json({
      success: false,
      message: 'Not authorized, token failed',
      error: { code: 'UNAUTHORIZED_TOKEN_FAILED', details: [error.message] }
    });
  }
};

const authRateLimiter = rateLimit({
  windowMs: 15*60*1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts, please try again later',
      error: { code: 'RATE_LIMIT_EXCEEDED', details: [] }
    });
  }
});

const setOptionalUser = async (req, res, next) => {
  let token;
  if(req.headers.authorization && req.headers.authorization.startsWith('Bearer')){
    token = req.headers.authorization.split(' ')[1];
  }
  if(!token) return next();
  try {
    const secret = (process.env.JWT_SECRET && process.env.JWT_SECRET.trim()) || 'default_jwt_secret_dev_key';
    const decoded = jwt.verify(token, secret);
    req.user = await User.findById(decoded.id).select('-password');
  } catch(error) {}
  next();
};

module.exports = { protect, authRateLimiter, setOptionalUser };