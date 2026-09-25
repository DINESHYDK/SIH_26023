const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../src/server');
const User = require('../src/models/User');
const Document = require('../src/models/Document');
const Folder = require('../src/models/Folder');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

jest.mock('axios');

let mongoServer;
let token1, token2, user1, user2;
const pdf = path.join(__dirname, 'folders-test.pdf');

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(mongoServer.getUri());
  fs.writeFileSync(pdf, 'dummy file content');
});

afterAll(async () => {
  fs.rmSync(pdf, { force: true });
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  jest.clearAllMocks();
  await Promise.all([Document.deleteMany({}), Folder.deleteMany({}), User.deleteMany({})]);
  const r1 = await request(app).post('/api/v1/auth/register').send({ name: 'User 1', email: 'u1@example.com', password: 'password' });
  const r2 = await request(app).post('/api/v1/auth/register').send({ name: 'User 2', email: 'u2@example.com', password: 'password' });
  token1 = r1.body.token; user1 = r1.body.user;
  token2 = r2.body.token; user2 = r2.body.user;
});

const makeDoc = (userId, fileName = 'a.pdf') => Document.create({ userId, fileName, fileSize: 1, status: 'completed' });
const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('DELETE /api/v1/documents/:id', () => {
  it('requires authentication', async () => {
    const doc = await makeDoc(user1._id);
    const res = await request(app).delete(`/api/v1/documents/${doc._id}`);
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for an invalid id and 404 for a missing one', async () => {
    const bad = await request(app).delete('/api/v1/documents/not-an-id').set(auth(token1));
    expect(bad.statusCode).toBe(400);
    const missing = await request(app).delete(`/api/v1/documents/${new mongoose.Types.ObjectId()}`).set(auth(token1));
    expect(missing.statusCode).toBe(404);
  });

  it("returns 403 and keeps the document when it belongs to another user", async () => {
    const doc = await makeDoc(user1._id);
    const res = await request(app).delete(`/api/v1/documents/${doc._id}`).set(auth(token2));
    expect(res.statusCode).toBe(403);
    expect(await Document.findById(doc._id)).not.toBeNull();
  });

  it('deletes the document and pulls it out of folders', async () => {
    const doc = await makeDoc(user1._id);
    const other = await makeDoc(user1._id, 'b.pdf');
    const folder = await Folder.create({ userId: user1._id, name: 'F', documentIds: [doc._id, other._id] });

    const res = await request(app).delete(`/api/v1/documents/${doc._id}`).set(auth(token1));
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(await Document.findById(doc._id)).toBeNull();

    const updated = await Folder.findById(folder._id);
    expect(updated.documentIds.map(String)).toEqual([String(other._id)]);
  });
});

describe('Folder endpoints', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/v1/folders')).statusCode).toBe(401);
    expect((await request(app).post('/api/v1/folders').send({ name: 'x' })).statusCode).toBe(401);
  });

  it('creates and lists only the current user\'s folders', async () => {
    const created = await request(app).post('/api/v1/folders').set(auth(token1)).send({ name: '  Reports  ' });
    expect(created.statusCode).toBe(201);
    expect(created.body.folder.name).toBe('Reports');
    expect(created.body.folder.userId).toBe(user1._id);
    await request(app).post('/api/v1/folders').set(auth(token2)).send({ name: 'Other' });

    const list = await request(app).get('/api/v1/folders').set(auth(token1));
    expect(list.statusCode).toBe(200);
    expect(list.body.count).toBe(1);
    expect(list.body.folders[0].name).toBe('Reports');
  });

  it('validates the create body', async () => {
    const res = await request(app).post('/api/v1/folders').set(auth(token1)).send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('gets a folder with documents populated', async () => {
    const doc = await makeDoc(user1._id);
    const folder = await Folder.create({ userId: user1._id, name: 'F', documentIds: [doc._id] });
    const res = await request(app).get(`/api/v1/folders/${folder._id}`).set(auth(token1));
    expect(res.statusCode).toBe(200);
    expect(res.body.folder.documentIds[0].fileName).toBe('a.pdf');
  });

  it('enforces ownership: 403 for another user, 404 missing, 400 bad id', async () => {
    const folder = await Folder.create({ userId: user1._id, name: 'F' });
    for (const [method, body] of [['get'], ['patch', { name: 'x' }], ['delete']]) {
      const r = request(app)[method](`/api/v1/folders/${folder._id}`).set(auth(token2));
      const res = await (body ? r.send(body) : r);
      expect(res.statusCode).toBe(403);
    }
    expect((await Folder.findById(folder._id)).name).toBe('F');
    expect((await request(app).get(`/api/v1/folders/${new mongoose.Types.ObjectId()}`).set(auth(token1))).statusCode).toBe(404);
    expect((await request(app).get('/api/v1/folders/nope').set(auth(token1))).statusCode).toBe(400);
  });

  it('renames and adds/removes documents', async () => {
    const d1 = await makeDoc(user1._id, 'a.pdf');
    const d2 = await makeDoc(user1._id, 'b.pdf');
    const folder = await Folder.create({ userId: user1._id, name: 'Old' });

    let res = await request(app).patch(`/api/v1/folders/${folder._id}`).set(auth(token1))
      .send({ name: 'New', addDocumentIds: [String(d1._id), String(d2._id), String(d1._id)] });
    expect(res.statusCode).toBe(200);
    expect(res.body.folder.name).toBe('New');
    expect(res.body.folder.documentIds).toHaveLength(2);

    res = await request(app).patch(`/api/v1/folders/${folder._id}`).set(auth(token1))
      .send({ removeDocumentIds: [String(d1._id)] });
    expect(res.body.folder.documentIds.map(d => d.fileName)).toEqual(['b.pdf']);
  });

  it("refuses to add another user's document or an empty patch", async () => {
    const foreign = await makeDoc(user2._id);
    const folder = await Folder.create({ userId: user1._id, name: 'F' });

    const res = await request(app).patch(`/api/v1/folders/${folder._id}`).set(auth(token1))
      .send({ addDocumentIds: [String(foreign._id)] });
    expect(res.statusCode).toBe(404);
    expect((await Folder.findById(folder._id)).documentIds).toHaveLength(0);

    const empty = await request(app).patch(`/api/v1/folders/${folder._id}`).set(auth(token1)).send({});
    expect(empty.statusCode).toBe(400);
  });

  it('deleting a folder unlinks but does not delete its documents', async () => {
    const doc = await makeDoc(user1._id);
    const folder = await Folder.create({ userId: user1._id, name: 'F', documentIds: [doc._id] });
    const res = await request(app).delete(`/api/v1/folders/${folder._id}`).set(auth(token1));
    expect(res.statusCode).toBe(200);
    expect(await Folder.findById(folder._id)).toBeNull();
    expect(await Document.findById(doc._id)).not.toBeNull();
  });
});

describe('POST /api/v1/documents/upload (multi-file)', () => {
  const batchResponse = {
    total: 3, processed: 1, failed: 2,
    documents: [
      { filename: 'one.pdf', status: 'processed', result: { summary: 'S1', document_id: 'ml-1' } },
      { filename: 'two.pdf', status: 'failed', error: 'unreadable' },
      { filename: 'three.pdf', status: 'rate_limited', error: 'slow down' },
    ],
  };

  const attachThree = (req) => req
    .attach('files', pdf, 'one.pdf').attach('files', pdf, 'two.pdf').attach('files', pdf, 'three.pdf');

  it('sends repeated `files` fields to the ML service and returns per-file results', async () => {
    axios.post.mockResolvedValueOnce({ data: batchResponse });

    const res = await attachThree(request(app).post('/api/v1/documents/upload').set(auth(token1)));

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ total: 3, processed: 1, failed: 2 });
    const [one, two, three] = res.body.documents;
    expect(one).toMatchObject({ fileName: 'one.pdf', status: 'processed' });
    expect(one.report.metadata.period).toBeTruthy();
    expect(one.document.id).toBe('ml-1');
    expect(two).toMatchObject({ status: 'failed', error: 'unreadable' });
    expect(two).not.toHaveProperty('report');
    expect(three.status).toBe('rate_limited');

    const sent = axios.post.mock.calls[0][1];
    expect(sent._streams.filter(s => typeof s === 'string' && s.includes('name="files"'))).toHaveLength(3);

    const docs = await Document.find({ userId: user1._id }).sort({ _id: 1 });
    expect(docs.map(d => [d.fileName, d.status])).toEqual([
      ['one.pdf', 'completed'], ['two.pdf', 'failed'], ['three.pdf', 'failed'],
    ]);
  });

  it('persists the ML document_id as mlDocumentId (batch) and exposes it in GET /documents', async () => {
    axios.post.mockResolvedValueOnce({ data: {
      ...batchResponse,
      documents: [{ ...batchResponse.documents[0], result: { summary: 'S1', document_id: 'abcdef0123456789' } }, ...batchResponse.documents.slice(1)],
    } });
    await attachThree(request(app).post('/api/v1/documents/upload').set(auth(token1)));

    const list = await request(app).get('/api/v1/documents').set(auth(token1));
    const byName = Object.fromEntries(list.body.documents.map(d => [d.fileName, d.mlDocumentId]));
    expect(byName).toEqual({ 'one.pdf': 'abcdef0123456789', 'two.pdf': null, 'three.pdf': null });
  });

  it('persists the ML document_id as mlDocumentId for a single upload', async () => {
    axios.post.mockResolvedValueOnce({ data: { summary: 's', document_id: '0123456789abcdef' } });
    const res = await request(app).post('/api/v1/documents/upload').set(auth(token1)).attach('file', pdf, 'solo.pdf');
    const doc = await Document.findById(res.body.documentId);
    expect(doc.mlDocumentId).toBe('0123456789abcdef');
  });

  it('still accepts the legacy single `file` field with the unchanged response shape', async () => {
    axios.post.mockResolvedValueOnce({ data: { summary: 'only one' } });
    const res = await request(app).post('/api/v1/documents/upload').set(auth(token1)).attach('file', pdf, 'solo.pdf');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('summary', 'only one');
    expect(res.body.report.metadata.period).toBeTruthy();
    expect(res.body).not.toHaveProperty('documents');
  });

  it('treats a batch reply with the wrong shape as a 502 and marks every document failed', async () => {
    axios.post.mockResolvedValueOnce({ data: { summary: 'not a batch' } });
    const res = await attachThree(request(app).post('/api/v1/documents/upload').set(auth(token1)));
    expect(res.statusCode).toBe(502);
    const docs = await Document.find({ userId: user1._id });
    expect(docs).toHaveLength(3);
    expect(docs.every(d => d.status === 'failed')).toBe(true);
  });

  it('falls back to offline demo results per file when ML is unreachable', async () => {
    axios.post.mockRejectedValueOnce(new Error('ML offline'));
    const res = await attachThree(request(app).post('/api/v1/documents/upload'));
    expect(res.statusCode).toBe(200);
    expect(res.body.offline).toBe(true);
    expect(res.body.documents).toHaveLength(3);
    expect(res.body.documents.every(d => d.status === 'demo' && d.report.metadata.period)).toBe(true);
  });

  it('rejects more than the allowed number of files with a JSON 400', async () => {
    let req = request(app).post('/api/v1/documents/upload');
    for (let i = 0; i < 11; i++) req = req.attach('files', pdf, `f${i}.pdf`);
    const res = await req;
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('rejects an unsupported file type inside a batch', async () => {
    const res = await request(app).post('/api/v1/documents/upload')
      .attach('files', pdf, 'ok.pdf').attach('files', Buffer.from('x'), 'bad.exe');
    expect(res.statusCode).toBe(400);
    expect(axios.post).not.toHaveBeenCalled();
  });
});
