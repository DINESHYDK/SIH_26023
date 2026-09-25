# CMPDI GeoReport AI — Project Notes for Claude

**Problem Statement ID:** 26023 | **Ministry of Coal / Coal India Limited (CMPDI)**

This file tracks how the project actually works today, not a one-time setup
task — keep it updated as the architecture changes. See `README.md` for
setup/run instructions and the full API table.

---

## Current architecture (read this before touching the workspace/reports flow)

- **Landing (`/`)**: marketing-only, separate stripped-down header (capsule
  nav, no app chrome) from the authenticated app. Signed-in users hitting `/`
  auto-redirect to `/dashboard`.
- **Workspace**: `/dashboard` is a **folder grid** (not a document list).
  Opening a folder (`/dashboard/[folderId]`) shows a NotebookLM-style
  sources-panel + chat layout; chat is grounded across every document in that
  folder at once.
- **Reports**: only reachable from within an opened folder
  (`/dashboard/[folderId]/reports`), pre-scoped to that folder's documents.
  There's no standalone `/reports` route.

## ⚠️ Folders are currently frontend-only — but a real backend now exists

`frontend/src/lib/folders.ts` stores folders in **localStorage**
(`{id, name, documentIds[]}`), because it was built before the backend had a
Folder model. **The backend now has a real one** (`Folder` model,
`GET/POST/PATCH/DELETE /api/v1/folders`, ownership-checked, auto-unlinks
documents on delete) — the frontend has not yet been migrated to use it. If
you're touching the Workspace, check whether that migration has happened
before assuming folders are still local-only; if not, migrating is the
highest-value remaining piece of backend integration work.

## ⚠️ Two document ID systems — do not mix them up

- **Mongo `_id`** (on the `Document` model) — used by `GET/DELETE /documents`
  and by `Folder.documentIds`.
- **ML content-hash id** (`Document.mlDocumentId`, 16 hex chars) — the
  **only** id `/query`'s `context_doc` accepts. Populated on successful
  upload; `null` for documents uploaded before this field existed or where ML
  processing failed. Anywhere you're about to send an id to `/query`, it must
  be `mlDocumentId`, never `_id`.

## Design system conventions (frontend)

- Custom Tailwind tokens only — check `frontend/tailwind.config.ts` before
  using a color or spacing value. Key tokens: `mining-gold-bright`/`-deep`
  (brand), `govtech-emerald` (positive), `state-warning`/`state-critical`
  (status — kept visually distinct from brand gold, they used to collide),
  `surface-*` (backgrounds), `border-crisp`/`border-subtle`.
  Spacing/typography use a custom scale (`p-space-lg`, `font-headline-md
  text-headline-md`, etc.), not Tailwind's default scale.
- Reuse existing card/panel patterns (`bg-surface-card border-border-crisp
  rounded-xl`) rather than inventing new visual language per component.
- `recharts` is installed but unused — charts (pit-production bars, KPI
  cards) are hand-built. Don't add a charting dependency unless a genuinely
  new chart type is needed.

## Known gaps (see `backend/TODO.md` for full detail)

- No `POST /api/v1/reports/generate` endpoint yet — Reports' "Generate"
  button attempts it and falls back to `/reports/mock` demo data with an
  on-page banner when it fails.
- Never confirmed whether `queryController.js` transforms the ML service's
  streaming plain-text `/query` response into the `{answer, citations}` JSON
  shape the frontend's chat UI expects.
- Frontend Workspace folders not yet migrated to the real `/api/v1/folders`
  API (see above).

## Working docs in this repo

- `REDESIGN_PLAN.md` — the frontend redesign plan this codebase was built
  from (landing rebuild, NotebookLM-style workspace, Reports rebuild).
- `UI_UX_REVIEW.md` — section-by-section UI/UX review notes and backlog.
- `backend/TODO.md` — backend-facing gaps discovered while building the
  frontend, written from the frontend side and updated as gaps get closed.
- `frontend/HERO_IMAGE_PROMPT.md` — generation prompt for the landing hero
  background.
