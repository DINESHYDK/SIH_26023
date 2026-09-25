const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/server');
const User = require('../src/models/User');
const QueryHistory = require('../src/models/QueryHistory');
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
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  jest.clearAllMocks();
  await QueryHistory.deleteMany({});
  await User.deleteMany({});

  const res1 = await request(app).post('/api/v1/auth/register').send({
    name: 'Query User 1', email: 'quser1@example.com', password: 'password'
  });
  user1Token = res1.body.token;
  user1 = res1.body.user;

  const res2 = await request(app).post('/api/v1/auth/register').send({
    name: 'Query User 2', email: 'quser2@example.com', password: 'password'
  });
  user2Token = res2.body.token;
  user2 = res2.body.user;
});

describe('Query Endpoints', () => {
  describe('POST /api/v1/query', () => {
    it('should return 400 if query is missing', async () => {
      const res = await request(app)
        .post('/api/v1/query')
        .send({});
      
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error', 'Query is required');
    });

    it('should process query without auth and NOT persist in DB', async () => {
      axios.post.mockResolvedValueOnce({
        data: { answer: 'Mock answer', citations: [] }
      });

      const res = await request(app)
        .post('/api/v1/query')
        .send({ query: 'What is coal?' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.answer).toBe('Mock answer');

      const histories = await QueryHistory.find();
      expect(histories.length).toBe(0);
    });

    it('should process query WITH auth and persist in DB', async () => {
      axios.post.mockResolvedValueOnce({
        data: {
          answer: 'Coal is a combustible black rock.',
          citations: [{ page: 1, source: 'doc.pdf' }]
        }
      });

      const res = await request(app)
        .post('/api/v1/query')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ query: 'What is coal?', context_doc: 'doc.pdf' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.answer).toBe('Coal is a combustible black rock.');

      const histories = await QueryHistory.find();
      expect(histories.length).toBe(1);
      expect(histories[0].userId.toString()).toBe(user1._id);
      expect(histories[0].query).toBe('What is coal?');
      expect(histories[0].answer).toBe('Coal is a combustible black rock.');
      expect(histories[0].contextDoc).toBe('doc.pdf');
      expect(histories[0].citations[0].page).toBe(1);
      expect(histories[0].citations[0].source).toBe('doc.pdf');
    });

    it('should NOT persist in DB if ML service fails (offline fallback)', async () => {
      axios.post.mockRejectedValueOnce(new Error('timeout'));

      const res = await request(app)
        .post('/api/v1/query')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ query: 'What is coal?' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.offline).toBe(true);

      const histories = await QueryHistory.find();
      expect(histories.length).toBe(0);
    });

    it('should proxy ML service 4xx response properly and NOT persist in DB', async () => {
      const mlError = new Error('ML error');
      mlError.response = { status: 400, data: { detail: 'Context doc not found' } };
      axios.post.mockRejectedValueOnce(mlError);

      const res = await request(app)
        .post('/api/v1/query')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ query: 'What is coal?', context_doc: 'missing.pdf' });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error', 'ML service error');
      expect(res.body.details).toHaveProperty('detail', 'Context doc not found');

      const histories = await QueryHistory.find();
      expect(histories.length).toBe(0);
    });
  });

  describe('GET /api/v1/query/history', () => {
    beforeEach(async () => {
      await QueryHistory.create([
        { userId: user1._id, query: 'Q1', answer: 'A1', timestamp: new Date(Date.now() - 1000) },
        { userId: user1._id, query: 'Q2', answer: 'A2', timestamp: new Date() },
        { userId: user2._id, query: 'Q3', answer: 'A3' }
      ]);
    });

    it('should return query history for authenticated user only, newest first', async () => {
      const res = await request(app)
        .get('/api/v1/query/history')
        .set('Authorization', `Bearer ${user1Token}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(2);
      expect(res.body.history.length).toBe(2);
      
      // Newest first check
      expect(res.body.history[0].query).toBe('Q2');
      expect(res.body.history[1].query).toBe('Q1');
      
      // User isolation check
      const hasUser2Data = res.body.history.some(h => h.userId === user2._id);
      expect(hasUser2Data).toBe(false);
    });

    it('should return empty list for user with no history', async () => {
      const res3 = await request(app).post('/api/v1/auth/register').send({
        name: 'Query User 3', email: 'quser3@example.com', password: 'password'
      });
      const user3Token = res3.body.token;

      const res = await request(app)
        .get('/api/v1/query/history')
        .set('Authorization', `Bearer ${user3Token}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.count).toBe(0);
      expect(res.body.history.length).toBe(0);
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/query/history');
      expect(res.statusCode).toEqual(401);
    });
  });
});
