# Backend TODO — Folders, Document Deletion, Multi-file Upload

Written from the frontend side (Workspace redesign added a folder/notebook UI
that's currently client-side-only). Verified against the actual current code
in this repo before writing — not carried over unchanged from an older draft.

## 1. Folder model + endpoints — still needed

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

## 2. Document deletion — still needed

`DELETE /api/v1/documents/:id` doesn't exist anywhere in `backend/src/routes/documents.js`.
Should verify ownership the same way `exportDocumentPDF` does
(`doc.userId.toString() !== req.user._id.toString()` → 403), 404 if not found,
and actually remove the document (and pull its ID out of any `Folder.documentIds`
arrays once folders exist).

## 3. Multi-file upload — ML service is ready, Node layer is not

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
