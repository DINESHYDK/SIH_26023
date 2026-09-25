const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateToken = (id) => {
  const secret = (process.env.JWT_SECRET && process.env.JWT_SECRET.trim()) || 'default_jwt_secret_dev_key';
  return jwt.sign({ id }, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

const register = async (req, res) => {
  try{
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if(existingUser){
      return res.status(409).json({
        success: false,
        message: 'Email is already registered',
        error: { code: 'USER_ALREADY_EXISTS', details: [] }
      });
    }

    const user = await User.create({
      name,
      email,
      password,
      provider: 'local'
    });

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: user.toSafeObject(),
      token,
      redirect: '/dashboard'
    });
  } 
  catch(error) {
    res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: { code: 'SERVER_ERROR', details: [error.message] }
    });
  }
};

const login = async (req, res) => {
  try{
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if(!user){
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        error: { code: 'INVALID_CREDENTIALS', details: [] }
      });
    }

    const isMatch = await user.comparePassword(password);
    if(!isMatch){
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        error: { code: 'INVALID_CREDENTIALS', details: [] }
      });
    }

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: user.toSafeObject(),
      token,
      redirect: '/dashboard'
    });
  } 
  catch(error){
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: { code: 'SERVER_ERROR', details: [error.message] }
    });
  }
};

const googleLogin = async (req, res) => {
  try{
    const { token } = req.body;

    let ticket;
    try{
      ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID
      });
    } 
    catch(err){
      return res.status(401).json({
        success: false,
        message: 'Invalid Google token',
        error: { code: 'INVALID_OAUTH_TOKEN', details: [] }
      });
    }

    const payload = ticket.getPayload();
    const { sub: googleId, email, name } = payload;

    let user = await User.findOne({ googleId });

    if(!user){
      user = await User.findOne({ email });
      if (user) {
        user.googleId = googleId;
        await user.save();
      } 
      else{
        user = await User.create({
          name,
          email,
          googleId,
          provider: 'google'
        });
      }
    }

    const authToken = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Google login successful',
      user: user.toSafeObject(),
      token: authToken,
      redirect: '/dashboard'
    });
  }
  catch(error){
    res.status(500).json({
      success: false,
      message: 'Server error during Google login',
      error: { code: 'SERVER_ERROR', details: [error.message] }
    });
  }
};

const getMe = async (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user.toSafeObject()
  });
};

const logout = async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logout successful, please remove token on client side',
    redirect: '/login'
  });
};

module.exports = { register, login, googleLogin, getMe, logout };
