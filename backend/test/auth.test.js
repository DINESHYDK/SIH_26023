const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/server');
const User = require('../src/models/User');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany();
  }
});

describe('Auth Endpoints', () => {
  const validUser = {
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123'
  };

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(validUser);
      
      if (res.statusCode === 500) {
        console.log('Register 500 error:', res.body);
      }
      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toHaveProperty('name', validUser.name);
      expect(res.body.user).toHaveProperty('email', validUser.email);
      expect(res.body.user).not.toHaveProperty('password');
    });

    it('should fail if email already exists', async () => {
      await request(app).post('/api/v1/auth/register').send(validUser);
      
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(validUser);
      
      expect(res.statusCode).toEqual(409);
      expect(res.body.success).toEqual(false);
      expect(res.body.error.code).toEqual('USER_ALREADY_EXISTS');
    });

    it('should fail with weak password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...validUser, password: '123' });
      
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toEqual(false);
      expect(res.body.error.code).toEqual('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/api/v1/auth/register').send(validUser);
    });

    it('should login successfully with correct credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: validUser.email, password: validUser.password });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('token');
    });

    it('should fail with incorrect password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: validUser.email, password: 'wrongpassword' });
      
      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toEqual(false);
      expect(res.body.error.code).toEqual('INVALID_CREDENTIALS');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    let token;

    beforeEach(async () => {
      const res = await request(app).post('/api/v1/auth/register').send(validUser);
      token = res.body.token;
    });

    it('should get current user with valid token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toEqual(true);
      expect(res.body.user).toHaveProperty('email', validUser.email);
    });

    it('should fail without token', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      
      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toEqual(false);
      expect(res.body.error.code).toEqual('UNAUTHORIZED_NO_TOKEN');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    let token;

    beforeEach(async () => {
      const res = await request(app).post('/api/v1/auth/register').send(validUser);
      token = res.body.token;
    });

    it('should logout successfully', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toEqual(true);
    });
  });
});
