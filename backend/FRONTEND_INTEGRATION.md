# Frontend Integration Guide

Describes the backend **as currently implemented** in `backend/src`. Anything marked
**"Backend team confirmation required"** could not be determined from the code.

---

## 1. Backend Base URL

| Environment | Base URL |
|---|---|
| Local | `http://localhost:5000` (port from `PORT` env var, default `5000`) |
| Deployed | `https://sih2026-7vmd.onrender.com` (from `frontend/.env.example`) |

Configure the frontend with a single variable and strip any trailing `/`:

```
NEXT_PUBLIC_API_BASE_URL=https://sih2026-7vmd.onrender.com   # or http://localhost:5000
```

All endpoints below are relative to this base. CORS is fully open (`cors()` with defaults).
Health check: `GET /api/health` → `{ "status": "ok", "service": "...", "timestamp": "<ISO>" }`.

> The deployed server may be running an older build than the source. If a response
> differs from this document, confirm the deployed version with the backend team.

---

## 2. Naming Conventions

- **Routes:** versioned, lowercase, under `/api/v1/<resource>`; multi-word segments use kebab-case (`/export-pdf`).
- **Methods:** `GET` for reads, `POST` for create/actions. No PUT/PATCH/DELETE exist.
- **JSON fields:** camelCase (`fileName`, `userId`, `contextDoc`, `wordCloud`, `uploadedAt`).
  **Exception:** the query request body field is snake_case: `context_doc`.
- **IDs:** MongoDB ObjectId strings, exposed as **`_id`** (not `id`) on user, document and history objects.
  Foreign key is `userId`.
- **Auth header:** `Authorization: Bearer <token>`. No cookies are used.
- **File field name:** `file`.
- **Timestamps:** ISO-8601 strings (Mongo `Date` serialized as JSON).
- **Enums:**
  - `user.provider`: `local` | `google`
  - `user.role`: `user` | `admin`
  - `document.status` (stored/list): `processing` | `completed` | `failed`
  - `document.status` (upload response `document` object): `processed` | `demo`
  - `dataMode`: `processed` | `demo`

---

## 3. Authentication

**Mechanism: JWT in the `Authorization: Bearer` header** (returned in the response body; not a cookie).
Token payload is `{ id }`, expiry from `JWT_EXPIRES_IN` (default `7d`).

```
Login / Register / Google  →  receive { user, token }
        ↓
Store token client-side, send  Authorization: Bearer <token>  on every request
        ↓
GET /api/v1/auth/me  (restore session on page load; 401 ⇒ clear token, go to /login)
        ↓
Dashboard
```

| Endpoint | Body | Success |
|---|---|---|
| `POST /api/v1/auth/register` | `{ name (2–50), email, password (min 6) }` all required | `201` |
| `POST /api/v1/auth/login` | `{ email, password }` | `200` |
| `POST /api/v1/auth/google` | `{ token }` — a **Google ID token** obtained by the frontend | `200` |
| `GET /api/v1/auth/me` | none, requires Bearer | `200` `{ success, user }` |
| `POST /api/v1/auth/logout` | none, requires Bearer | `200` — **server does not invalidate the token**; the client must delete it |

Register/login/google success body:

```json
{ "success": true, "message": "...", "user": { }, "token": "<jwt>", "redirect": "/dashboard" }
```

`redirect` is `/dashboard` (login/register/google) or `/login` (logout). `register`/`login`/`google` are rate-limited (100 requests / 15 min per IP → `429`).

Google sign-in uses an existing account with the same email (links `googleId`) or creates a new one.

**Optional auth:** `POST /api/v1/documents/upload` and `POST /api/v1/query` work **without** a token (guest; nothing is saved).
If a token is sent but invalid/expired, the backend **silently treats you as a guest — no 401**. Data will not be persisted, so refresh/validate the token via `/auth/me` beforehand.

---

## 4. User Data

Returned by `user` in auth responses and `/auth/me`:

```json
{
  "_id": "665f...",
  "name": "Asha Rao",
  "email": "asha@example.com",
  "provider": "local",
  "role": "user",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

- Google users additionally include `googleId`. **Do not display or store it** unless needed.
- Password/hash and `__v` are stripped by the backend. Never send or persist passwords in client storage.
- There is no `id` field — use `_id`.

---

## 5. Document Upload API

`POST /api/v1/documents/upload` — auth **optional** (Bearer = saved to the user's account; none = guest, not saved).

- **Content-Type:** `multipart/form-data` (let the browser set the boundary).
- **Field:** `file` (single file).
- **Allowed extensions:** `.pdf`, `.xlsx`, `.csv`, `.tiff`, `.tif` (checked by extension, case-insensitive).
- **Max size:** 50 MB.

```js
const fd = new FormData();
fd.append("file", file);                       // field name must be "file"
const res = await fetch(`${API}/api/v1/documents/upload`, {
  method: "POST",
  headers: token ? { Authorization: `Bearer ${token}` } : {},  // do NOT set Content-Type
  body: fd,
});
const data = await res.json();
if (!res.ok) throw new Error(data.message || data.error || "Upload failed");
```

**Success `200`:**

```json
{
  "message": "Document processed successfully",
  "fileName": "report.pdf",
  "size": 324608,
  "documentId": "665f...",            // Mongo _id; null for guests
  "document": { "id": "…", "fileName": "report.pdf", "size": 324608, "status": "processed" },
  "report": {
    "dataMode": "processed",
    "metadata": { "reportId": "…", "title": "report.pdf", "subsidiary": "…", "region": "…", "period": "…", "preparedBy": "…", "classification": "…" },
    "summary": "…", "kpis": { }, "wordcloud": [ ], "topics": [ ], "productionByPit": [ ], "executiveReport": { "sections": [ ] }
  }
}
```

The response also contains any top-level fields returned by the ML service (spread into the body). `report` is a demo template overlaid with ML `summary`, `kpis`, `wordcloud`, `topics` when the ML service returns them.
`report.dataMode` is `"processed"` only if ML returned at least one of `summary/kpis/wordcloud/topics`, otherwise `"demo"`.

**ML service unreachable → still `200`:** same shape plus `"offline": true`, `message: "Document uploaded (ML service unavailable - offline mode)"`, `document.status: "demo"`, `report.dataMode: "demo"`. The stored document (if authenticated) is marked `failed`.

**Errors:**

| Status | Body | When |
|---|---|---|
| 400 | `{ "error": "No file uploaded" }` | no `file` part |
| 400 | `{ "success": false, "error": "Upload rejected", "message": "File type .exe not allowed. Accepted: .pdf, .xlsx, .csv, .tiff, .tif" }` | bad type* |
| 413 | `{ "success": false, "error": "File too large", "message": "File exceeds the 50 MB limit." }` | > 50 MB* |
| ML 4xx/5xx | `{ "success": false, "message": "<ML detail>", "error": "ML service error", "details": <ML body> }` | same status as the ML service |
| 502 | `{ "success": false, "message": "The ML service returned an unexpected response.", "error": "Malformed ML response" }` | ML 2xx body not a JSON object* |
| 500 | `{ "success": false, "message": "Upload failed. Please try again.", "error": "Upload failed", "details": "…" }` | unexpected |

\* These JSON error bodies exist in the latest source (commit `f43a514`); a deployment older than that returns an HTML 500 page for these cases.

---

## 6. Document List / Sidebar API

`GET /api/v1/documents` — **Bearer required.** No query parameters, no pagination.

Returns only the **authenticated user's** documents, newest first (`uploadedAt` descending).

```json
{ "success": true, "count": 1, "documents": [
  { "_id": "665f...", "userId": "665e...", "fileName": "report.pdf", "fileSize": 324608,
    "uploadedAt": "…", "summary": "", "kpis": { }, "wordCloud": [ ], "topics": [ ],
    "status": "completed", "createdAt": "…", "updatedAt": "…" }
] }
```

Note `wordCloud` (camelCase capital C) here vs `wordcloud` in the upload `report`. Guest uploads never appear in this list.

---

## 7. Q&A / Query API

`POST /api/v1/query` — auth **optional** (Bearer = the exchange is saved to history; guest = not saved).

Request (`application/json`):

| Field | Required | Notes |
|---|---|---|
| `query` | **yes** | non-empty string |
| `context_doc` | no | string identifying the document context; defaults to `""`. Format expected by the ML service: Backend team confirmation required. |

**Success `200`:** the ML response spread into the body, plus `dataMode: "processed"`:

```json
{ "answer": "…", "citations": [ { "page": 3, "source": "report.pdf" } ], "dataMode": "processed" }
```

- If the ML service returns plain text, the backend wraps it as `{ answer: <text>, citations: [] }`.
- `citations` items are stored as `{ page: number, source: string }`; the live response passes through whatever the ML service returns — confirm the ML citation shape.
- Any extra ML fields are passed through unchanged.

**ML unreachable → `200` fallback:**
`{ "answer": "The ML service is currently offline. …", "citations": [], "offline": true, "dataMode": "demo" }`. Not saved to history. Check `offline`/`dataMode` and show it as a demo answer.

**Errors:**

| Status | Body |
|---|---|
| 400 | `{ "error": "Query is required" }` |
| ML 4xx/5xx (same status) | `{ "success": false, "message": "<ML detail or default>", "error": "ML service error", "details": … }` |
| 500 | `{ "error": "Query failed", "details": "…" }` |

---

## 8. Q&A History API

`GET /api/v1/query/history` — **Bearer required.** No parameters/pagination. Only the authenticated user's entries, **newest first** (`timestamp` descending).

```json
{ "success": true, "count": 1, "history": [
  { "_id": "…", "userId": "…", "query": "…", "answer": "…",
    "citations": [ { "page": 3, "source": "report.pdf" } ],
    "contextDoc": "", "timestamp": "2026-01-01T00:00:00.000Z",
    "createdAt": "…", "updatedAt": "…" }
] }
```

Use it to render previous Q&A; group/filter by `contextDoc` to show history per document. History is a flat list — there are no conversation/thread IDs. Reverse it if you need chronological order.

---

## 9. PDF Export

`GET /api/v1/reports/:id/export-pdf` — **Bearer required.** `:id` = the document's Mongo `_id` (the `documentId` from upload, or `_id` from the list). Only the owner may export.

- **Success `200`:** binary PDF, `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="cmpdi_docket_<name>.pdf"`. Also sets headers `X-Document-Id` and `X-Integrity-Hash` (SHA-256).
- Errors (JSON `{ "success": false, "error": "…" }`): `400` invalid id format, `401` no/invalid token (auth-format body, see §10), `403` not the owner, `404` not found, `500` DB/PDF failure.

Because it needs the Bearer header, fetch it and download the blob (an `<a href>` won't send the header):

```js
const res = await fetch(`${API}/api/v1/reports/${id}/export-pdf`, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) throw new Error((await res.json()).error);
const url = URL.createObjectURL(await res.blob());
Object.assign(document.createElement("a"), { href: url, download: "docket.pdf" }).click();
URL.revokeObjectURL(url);
```

CORS does not expose custom headers, so `X-Integrity-Hash` / `Content-Disposition` are not readable from browser JS. Choose the filename client-side.

Also available: `GET /api/v1/reports/mock` (no auth) returns a demo report object (`dataMode`, `metadata`, `summary`, `kpis`, `wordcloud`, `topics`, `productionByPit`, `executiveReport`, …) with no wrapper.

---

## 10. Error Handling

There are **three** error body shapes — handle all of them:

1. **Auth endpoints & auth middleware:**
   `{ "success": false, "message": "…", "error": { "code": "…", "details": [ … ] } }`
   Codes: `VALIDATION_ERROR` (400, `details` = messages), `USER_ALREADY_EXISTS` (409), `INVALID_CREDENTIALS` (401), `INVALID_OAUTH_TOKEN` (401), `UNAUTHORIZED_NO_TOKEN` / `UNAUTHORIZED_TOKEN_FAILED` / `UNAUTHORIZED_USER_DELETED` (401), `RATE_LIMIT_EXCEEDED` (429), `SERVER_ERROR` (500).
2. **Documents / query / reports:** `error` is a **string**; `message` may or may not be present (see §5, §7, §9).
3. **HTML** — only from deployments older than the latest source (upload type/size rejections).

| Status | Meaning here |
|---|---|
| 200 / 201 | success (201 = register). `200` may still carry `offline: true` |
| 400 | validation, missing file/query, bad file type, bad ObjectId |
| 401 | missing/invalid/expired token, bad credentials |
| 403 | exporting a document you don't own |
| 404 | document not found (export) |
| 409 | email already registered |
| 413 | file > 50 MB |
| 429 | auth rate limit |
| 500 | server error |
| 502 | ML returned a malformed body (upload) |
| ML status | ML 4xx/5xx statuses are proxied as-is (upload, query) |

```js
async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, opts);
  const body = await res.json().catch(() => null);      // may be non-JSON
  if (res.ok) return body;
  if (res.status === 401) { clearToken(); redirect("/login"); }
  const err = body?.error;
  throw new Error(
    body?.message || (typeof err === "string" ? err : err?.details?.join(", ")) || `Request failed (${res.status})`
  );
}
```

---

## 11. Frontend Integration Flow

```
Register / Login / Google  →  save token
        ↓
GET /auth/me  (on every app load)
        ↓
Dashboard  →  GET /documents  (sidebar)
        ↓
POST /documents/upload  (Bearer, FormData "file")
        ↓
Backend → ML service /process-document
        ↓
Render response.report  (check report.dataMode / offline)
        ↓
Document saved (authenticated only)  →  re-GET /documents
        ↓
POST /query { query, context_doc }  →  show answer + citations
        ↓
GET /query/history  →  show previous Q&A
        ↓
GET /reports/:documentId/export-pdf  →  download docket
```

---

## 12. API Quick Reference

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/auth/register` | – | Create account, get token |
| POST | `/api/v1/auth/login` | – | Email/password login |
| POST | `/api/v1/auth/google` | – | Login with Google ID token |
| GET | `/api/v1/auth/me` | Bearer | Current user |
| POST | `/api/v1/auth/logout` | Bearer | Client-side logout hint |
| POST | `/api/v1/documents/upload` | Optional | Upload + ML analysis |
| GET | `/api/v1/documents` | Bearer | User's documents (sidebar) |
| POST | `/api/v1/query` | Optional | Ask a question |
| GET | `/api/v1/query/history` | Bearer | User's Q&A history |
| GET | `/api/v1/reports/:id/export-pdf` | Bearer | Download PDF docket |
| GET | `/api/v1/reports/mock` | – | Demo report data |
| GET | `/api/health` | – | Health check |

12 endpoints.

---

## 13. Frontend Do / Don't

**DO**
- Use exact field names, including `_id`, `context_doc` (snake_case) and `wordCloud` vs `wordcloud`.
- Use `FormData` with field `file` for uploads and let the browser set `Content-Type`.
- Send `Authorization: Bearer <token>` on every protected call, and on upload/query if you want data saved.
- Handle 401 (clear token → login), 403, 413, 429 and non-JSON error bodies.
- Check `offline` / `dataMode` and label demo data as such.
- Fetch the PDF as a blob using the Bearer header.

**DON'T**
- Don't treat a `200` as "ML worked" — check `offline`.
- Don't build multipart bodies manually or set the multipart `Content-Type` yourself.
- Don't rely on `/auth/logout` to invalidate the token.
- Don't assume `id`; the field is `_id`.
- Don't store passwords or the `googleId`; don't put secrets in frontend env vars (only the public API base URL).
- Don't invent fields not listed here.

---

## 14. Backend Contract Notes

- **Required:** register `name`, `email`, `password`; login `email`, `password`; google `token`; upload `file`; query `query`.
- **Optional:** `context_doc`; the `Authorization` header on upload/query.
- **May be null:** upload `documentId` (guests). Document `summary` may be `""`, `kpis` `{}`, `wordCloud`/`topics` `[]`.
- **Depends on the ML response:** upload top-level extras, `report.summary/kpis/wordcloud/topics`, `report.dataMode`, `document.id` (ML `document_id` if provided, else DB id, else file name); query `answer`, `citations` and any extra fields.
- **Limitations:**
  - Upload `report` is built from a **demo template** (`metadata.subsidiary/region/period/preparedBy/classification` and `productionByPit` are template values, not extracted from the PDF). Only `metadata.title` (file name) and `reportId` come from the file/ML.
  - Upload overwrites the ML `message`; `size`/`fileName` come from the upload.
  - No pagination, delete, rename, or per-conversation endpoints.
  - PDF export works only for documents saved to an account.
  - Invalid tokens on optional-auth routes silently degrade to guest.
- **Backend team confirmation required:**
  - Deployed backend version (matches latest source?).
  - Exact `context_doc` format the ML service expects (file name vs ID).
  - ML citation shape in live responses (`{ page, source }` is what history stores).
  - `JWT_SECRET` must be set in production (the code falls back to a default dev key if it is missing).
