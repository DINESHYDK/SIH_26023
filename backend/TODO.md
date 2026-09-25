# Backend TODO — Folders, Document Deletion, Multi-file Upload

Written from the frontend side (Workspace redesign added a folder/notebook UI
that's currently client-side-only). Verified against the actual current code
in this repo before writing — not carried over unchanged from an older draft.

## Status

- [x] 1. Folder model + endpoints — done and tested (`tests/folders.test.js`)
- [x] 2. Document deletion — done and tested
- [x] 3. Multi-file upload (Node layer) — done and tested with a mocked ML service.
  The earlier ML-side blocker (commented-out `file` parameter causing a `NameError`)
  is resolved upstream: `ml_service/main.py` declares `file: Optional[UploadFile]` again.
- [x] 4. `mlDocumentId` persistence — done and tested. The upstream fix conflicted with the
  multi-file upload code; resolved by moving the assignment into the shared `markCompleted`
  helper, so **both single and batch uploads** now persist it (the upstream version only
  covered single uploads).

Implementation notes:
- Folders: `PATCH /api/v1/folders/:id` takes `{ name?, addDocumentIds?, removeDocumentIds? }`
  (at least one). Only the user's own documents can be added. Responses use
  `{ success, folder | folders }`; errors use `{ success: false, error }`.
- Deletion: `DELETE /api/v1/documents/:id` → `{ success, message, id }`; also `$pull`s the id
  from the user's folders.
- Upload: route accepts legacy `file` and/or repeated `files` (max 10 per request); the
  outgoing ML request always uses repeated `files` fields. A single file returns the
  unchanged response; 2+ files return `{ message, total, processed, failed, documents: [...] }`.

## 1. Folder model + endpoints — DONE

No grouping model exists. `Document` (`backend/src/models/Document.js`) has no
`folderId`/`notebookId` field, and there's no `Folder` model. As an interim
measure, the frontend implements folders as a **client-side-only** construct
(`frontend/src/lib/folders.ts`, backed by `localStorage`) referencing document
IDs from the existing `GET /api/v1/documents` list. This means folders are
per-browser only — not synced across devices or teammates, lost if storage is
cleared.

Proposed model, e.g. `backend/src/models/Folder.js`:
```js
{
  userId: { type: ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true },
  documentIds: [{ type: ObjectId, ref: 'Document' }],
  createdAt, updatedAt (timestamps: true)
}
```

Routes (mirror the ownership-check pattern already used in
`reportController.js`'s `exportDocumentPDF` — compare `req.user._id` against
the folder's `userId` on every read/write):
- `GET /api/v1/folders` — list the current user's folders
- `POST /api/v1/folders` — create `{ name }`
- `GET /api/v1/folders/:id` — get one folder with documents populated
- `PATCH /api/v1/folders/:id` — rename, and/or add/remove a `documentId`
- `DELETE /api/v1/folders/:id` — delete the folder; recommend this only
  **unlinks** documents rather than cascade-deleting them (a document could
  reasonably belong to more than one folder later)

Once live, `frontend/src/lib/folders.ts` swaps its localStorage calls for real
API calls — the rest of the UI shouldn't need to change.

## 2. Document deletion — DONE

`DELETE /api/v1/documents/:id` doesn't exist anywhere in `backend/src/routes/documents.js`.
Should verify ownership the same way `exportDocumentPDF` does
(`doc.userId.toString() !== req.user._id.toString()` → 403), 404 if not found,
and actually remove the document (and pull its ID out of any `Folder.documentIds`
arrays once folders exist).

## 3. Multi-file upload — Node layer DONE (ML `file` NameError still blocks real use)

Good news: `ml_service/main.py`'s `/process-document` **already accepts a
batch** (`files: Optional[list[UploadFile]] = File(None)`, alongside the
legacy single `file` field for backward compat — see `main.py:73-90`).

The gap is entirely in the Node layer:
- `backend/src/routes/documents.js:13` still calls `upload.single('file')`
  (multer), so Express only ever receives one file (`req.file`).
- `backend/src/controllers/documentController.js`'s `uploadDocument` reads
  `req.file` (singular) and posts a single `file` form field to the ML
  service (`documentController.js:70-75`) — it never uses ML's new `files`
  field at all.

To close the gap: switch to `upload.array('files')` (or similar) so Express
collects `req.files` (plural), then in `uploadDocument` build the outgoing
`FormData` with **repeated `files` fields** (one `formData.append('files', ...)`
per uploaded file) instead of the single `file` field, so it actually reaches
the ML service's new batch parameter. Until this lands, the frontend works
around it by calling the existing single-file endpoint once per file,
sequentially.

## 4. DONE — two document ID systems were being conflated

Found while wiring up the frontend's folder Q&A: the ML service assigns each
document its own content-hash id (16 hex chars — see `typed_rag.py`/`scanned_rag.py`,
`hashlib.sha256(content).hexdigest()[:16]`), and `/query`'s `context_doc`
strictly requires *that* id (`query_agent.py`'s `_validate_id` rejects
anything that isn't exactly 16 hex chars). That id is completely different
from `Document`'s Mongo `_id` (24-char ObjectId) — and the ML id was never
persisted back to Mongo, only ever returned transiently in the upload
response.

Effect before this fix: `GET /api/v1/documents` could never expose an ML-queryable
id at all, so any frontend flow that added an "existing" document (rather than
a freshly-uploaded one) to a query's context would send `/query` a Mongo `_id`
and get a validation failure.

**Fix applied** (`backend/src/models/Document.js` + `documentController.js`'s
`uploadDocument`): added a new `mlDocumentId` field to the `Document` schema,
populated from `mlData.document_id` on successful upload. `GET /api/v1/documents`
now returns it automatically (no route change needed, it doesn't `.select()`
specific fields). Frontend now reads/writes `mlDocumentId` everywhere it needs
an ML-queryable id, instead of `_id`.

**Caveat**: any document uploaded *before* this field existed has
`mlDocumentId: null` and can't be used in a query's context until re-uploaded.
No backfill was attempted (there's no way to recover the ML id after the fact
without re-running ingestion). If you want a backfill path instead of relying
on re-upload, that'd need a one-off script calling the ML service again per
old document — not done here.

**Completion notes (backend):**
- Merged with the multi-file upload work: `mlDocumentId` is set in `markCompleted`
  (`documentController.js`), which both the single-file and batch paths call. In a batch,
  each file's id comes from its own `documents[i].result.document_id`. Failed/rate-limited
  files keep `mlDocumentId: null`.
- Only a non-empty string `document_id` is stored; nothing is fabricated when ML omits it.
- Tests: `tests/folders.test.js` covers single upload persistence and batch persistence +
  exposure via `GET /api/v1/documents` (55/55 tests pass).
- **Heads-up for the folder API swap:** backend `Folder.documentIds` stores Mongo `_id`s
  (ownership is checked against `Document`), while the client-side folders in
  `frontend/src/lib/folders.ts` store `mlDocumentId`s. When the frontend switches to
  `/api/v1/folders`, it must send `_id`s to `PATCH` and map to `mlDocumentId` (from the
  populated documents in `GET /api/v1/folders/:id`) when building `context_doc`.
