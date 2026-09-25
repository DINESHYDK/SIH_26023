const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/server');
const User = require('../src/models/User');
const Document = require('../src/models/Document');
const { computeDocumentHash } = require('../src/services/pdfService');

let mongoServer;
let user1Token, user2Token;
let user1, user2;
let docRecord;

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
  await Document.deleteMany({});
  await User.deleteMany({});

  const res1 = await request(app).post('/api/v1/auth/register').send({
    name: 'PDF User 1', email: 'pdfuser1@example.com', password: 'password'
  });
  user1Token = res1.body.token;
  user1 = res1.body.user;

  const res2 = await request(app).post('/api/v1/auth/register').send({
    name: 'PDF User 2', email: 'pdfuser2@example.com', password: 'password'
  });
  user2Token = res2.body.token;
  user2 = res2.body.user;

  // Create a document owned by user1
  docRecord = await Document.create({
    userId: user1._id,
    fileName: 'test_report.pdf',
    fileSize: 12345,
    summary: 'Test geological summary for export.',
    kpis: { coalProduction: 14.82, strippingRatio: 2.16 },
    topics: [{ name: 'Strata Stability', status: 'Stable' }],
    status: 'completed'
  });
});

describe('GET /api/v1/reports/:id/export-pdf', () => {
  it('should return 401 if no auth token provided', async () => {
    const res = await request(app).get(`/api/v1/reports/${docRecord._id}/export-pdf`);
    expect(res.statusCode).toEqual(401);
  });

  it('should return 400 for an invalid ObjectId format', async () => {
    const res = await request(app)
      .get('/api/v1/reports/not-a-valid-id/export-pdf')
      .set('Authorization', `Bearer ${user1Token}`);
    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toMatch(/Invalid document ID/i);
  });

  it('should return 404 for a valid ObjectId that does not exist', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/v1/reports/${fakeId}/export-pdf`)
      .set('Authorization', `Bearer ${user1Token}`);
    expect(res.statusCode).toEqual(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('should return 403 if authenticated user does not own the document', async () => {
    const res = await request(app)
      .get(`/api/v1/reports/${docRecord._id}/export-pdf`)
      .set('Authorization', `Bearer ${user2Token}`);
    expect(res.statusCode).toEqual(403);
    expect(res.body.error).toMatch(/Access denied/i);
  });

  it('should return a valid PDF buffer for the document owner', async () => {
    const res = await request(app)
      .get(`/api/v1/reports/${docRecord._id}/export-pdf`)
      .set('Authorization', `Bearer ${user1Token}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.statusCode).toEqual(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.headers['content-disposition']).toMatch(/test_report\.pdf/);
    expect(res.headers['x-document-id']).toEqual(docRecord._id.toString());
    expect(res.headers).toHaveProperty('x-integrity-hash');

    // Verify it starts with the PDF magic bytes
    const pdfMagic = res.body.slice(0, 4).toString('ascii');
    expect(pdfMagic).toEqual('%PDF');
  });

  it('should include a valid and deterministic SHA-256 integrity hash header', async () => {
    const res1 = await request(app)
      .get(`/api/v1/reports/${docRecord._id}/export-pdf`)
      .set('Authorization', `Bearer ${user1Token}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    const res2 = await request(app)
      .get(`/api/v1/reports/${docRecord._id}/export-pdf`)
      .set('Authorization', `Bearer ${user1Token}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    // Hashes must be identical across two requests (deterministic)
    expect(res1.headers['x-integrity-hash']).toEqual(res2.headers['x-integrity-hash']);

    // Hash must be a 64-char lowercase hex string (SHA-256)
    expect(res1.headers['x-integrity-hash']).toMatch(/^[a-f0-9]{64}$/);

    // Cross-check with direct function
    const expectedHash = computeDocumentHash(docRecord.toObject ? docRecord.toObject() : docRecord);
    expect(res1.headers['x-integrity-hash']).toEqual(expectedHash);
  });

  it('should not expose another user document in PDF docket', async () => {
    // user2 tries to export user1 doc
    const res = await request(app)
      .get(`/api/v1/reports/${docRecord._id}/export-pdf`)
      .set('Authorization', `Bearer ${user2Token}`);
    expect(res.statusCode).toEqual(403);
  });
});

describe('GET /api/v1/reports/mock (existing endpoint integrity)', () => {
  it('should still return the mock report without authentication', async () => {
    const res = await request(app).get('/api/v1/reports/mock');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('subsidiary', 'BCCL');
    expect(res.body).toHaveProperty('kpis');
  });
});
