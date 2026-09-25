const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/server');
const User = require('../src/models/User');
const Document = require('../src/models/Document');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

jest.mock('axios');

let mongoServer;
let user1Token, user2Token;
let user1, user2;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await mongoose.connect(mongoUri);

  // Setup mock file
  fs.writeFileSync(path.join(__dirname, 'test.pdf'), 'dummy file content');
});

afterAll(async () => {
  fs.rmSync(path.join(__dirname, 'test.pdf'), { force: true });
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  jest.clearAllMocks();
  await Document.deleteMany({});
  await User.deleteMany({});

  // Setup users
  const res1 = await request(app).post('/api/v1/auth/register').send({
    name: 'User 1', email: 'user1@example.com', password: 'password'
  });
  user1Token = res1.body.token;
  user1 = res1.body.user;

  const res2 = await request(app).post('/api/v1/auth/register').send({
    name: 'User 2', email: 'user2@example.com', password: 'password'
  });
  user2Token = res2.body.token;
  user2 = res2.body.user;
});

describe('Document Endpoints', () => {
  describe('POST /api/v1/documents/upload', () => {
    it('should upload document without auth (guest) and not persist in DB', async () => {
      axios.post.mockResolvedValueOnce({ data: { summary: 'mocked summary' } });

      const res = await request(app)
        .post('/api/v1/documents/upload')
        .attach('file', path.join(__dirname, 'test.pdf'));
      
      if (res.statusCode === 500) console.log(res.body);

      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('summary', 'mocked summary');
      expect(res.body).toHaveProperty('documentId', null);

      const docs = await Document.find();
      expect(docs.length).toBe(0);
    });

    it('should upload document with auth and persist in DB as completed', async () => {
      axios.post.mockResolvedValueOnce({ 
        data: { summary: 'mocked auth summary', kpis: { score: 10 } } 
      });

      const res = await request(app)
        .post('/api/v1/documents/upload')
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('file', path.join(__dirname, 'test.pdf'));
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('summary', 'mocked auth summary');
      expect(res.body).toHaveProperty('documentId');
      expect(res.body.documentId).not.toBeNull();

      const doc = await Document.findById(res.body.documentId);
      expect(doc).not.toBeNull();
      expect(doc.userId.toString()).toBe(user1._id);
      expect(doc.status).toBe('completed');
      expect(doc.summary).toBe('mocked auth summary');
      expect(doc.kpis.score).toBe(10);
      expect(doc.fileName).toBe('test.pdf');
    });

    it('should handle ML service failure, persisting as failed', async () => {
      axios.post.mockRejectedValueOnce(new Error('ML offline'));

      const res = await request(app)
        .post('/api/v1/documents/upload')
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('file', path.join(__dirname, 'test.pdf'));
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('offline', true);
      expect(res.body).toHaveProperty('documentId');

      const doc = await Document.findById(res.body.documentId);
      expect(doc).not.toBeNull();
      expect(doc.status).toBe('failed');
    });

    it('should correctly proxy ML service 4xx responses and persist as failed', async () => {
      const mlError = new Error('ML error');
      mlError.response = { status: 422, data: { detail: 'Invalid file format' } };
      axios.post.mockRejectedValueOnce(mlError);

      const res = await request(app)
        .post('/api/v1/documents/upload')
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('file', path.join(__dirname, 'test.pdf'));
      
      expect(res.statusCode).toEqual(422);
      expect(res.body).toHaveProperty('error', 'ML service error');
      expect(res.body).toHaveProperty('details');
      expect(res.body.details).toHaveProperty('detail', 'Invalid file format');

      const docs = await Document.find({ userId: user1._id }).sort({ uploadedAt: -1 });
      expect(docs[0].status).toBe('failed');
    });
  });

  describe('GET /api/v1/documents', () => {
    beforeEach(async () => {
      // Seed some documents
      await Document.create([
        { userId: user1._id, fileName: 'doc1.pdf', status: 'completed' },
        { userId: user1._id, fileName: 'doc2.pdf', status: 'failed' },
        { userId: user2._id, fileName: 'doc3.pdf', status: 'processing' },
      ]);
    });

    it('should return documents for authenticated user only', async () => {
      const res = await request(app)
        .get('/api/v1/documents')
        .set('Authorization', `Bearer ${user1Token}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(2);
      expect(res.body.documents.length).toBe(2);
      
      // Check user isolation
      const hasUser2Docs = res.body.documents.some(d => d.userId === user2._id);
      expect(hasUser2Docs).toBe(false);
    });

    it('should return empty list for user with no documents', async () => {
      const res3 = await request(app).post('/api/v1/auth/register').send({
        name: 'User 3', email: 'user3@example.com', password: 'password'
      });
      const user3Token = res3.body.token;

      const res = await request(app)
        .get('/api/v1/documents')
        .set('Authorization', `Bearer ${user3Token}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.count).toBe(0);
      expect(res.body.documents.length).toBe(0);
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/documents');
      expect(res.statusCode).toEqual(401);
    });
  });
});

