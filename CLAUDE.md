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

## Folders are real, server-side, and use Mongo `_id`s

The Workspace calls the real `Folder` API (`GET/POST/PATCH/DELETE
/api/v1/folders`) — there is no localStorage folder store anymore. A folder's
`documentIds` are **Mongo `_id`s** (matching `GET /api/v1/documents`'
`_id`), not ML ids. `GET/PATCH /api/v1/folders/:id` return documents
*populated* (full `DocumentListItem` objects), so the frontend rarely needs a
separate `GET /api/v1/documents` call except to offer "add from library"
candidates not yet in the folder.

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

## Report charts share one contract (ML → frontend → PDF)

ML reports (`POST /generate-report` on the ML service) return `charts` and
`kpis` in the shape defined in `ml_service/services/chart_service.py`
(mirrored by `ReportChart`/`ReportKpi` in `frontend/src/lib/report-types.ts`).
Every data row has a string `label` plus one number-or-null per series key;
series order is colour order. `ReportChartView.tsx` (screen) and
`services/report_generator.py` (PDF) both render it and use the same palette
order — change the contract, both renderers and the TS type together. New
charts go through `normalize_chart`, never hand-built dicts.

`/generate-report` takes **either** `file_ids` **or** `date_from`/`date_to`
(local calendar days, not UTC) — both together is a 422. Each selected
document is analysed in its own LLM call with its own budget
(`REPORT_DOCUMENT_CHARS`; long documents send their most instruction-relevant
pages), then merged. Never go back to one shared prompt: a single long
document used to crowd every other document out of it.

## Query citations and scanned-page images

ML `/query` streams the answer as plain text and sends its citations in the
`X-Citations` response header (JSON list). `queryController.js` buffers the
text into `{answer, citations}` and, for scanned-page citations, fetches
`GET /documents/:mlId/pages/:page` from the ML service to attach
`imageBase64`/`imageMimeType`; the chat shows them as "Reference Pages".
Those images come from the per-batch Vision JSON written at ingestion
(`storage/scanned_documents/<id>/extracted_pages/batches/`), i.e. exactly the
images sent to Gemini. `QueryHistory` stores citations without the images.

## Known gaps (see `backend/TODO.md` for full detail)

- No `POST /api/v1/reports/generate` endpoint yet — Reports' "Generate"
  button attempts it and falls back to `/reports/mock` demo data with an
  on-page banner when it fails.

## Working docs in this repo

- `REDESIGN_PLAN.md` — the frontend redesign plan this codebase was built
  from (landing rebuild, NotebookLM-style workspace, Reports rebuild).
- `UI_UX_REVIEW.md` — section-by-section UI/UX review notes and backlog.
- `backend/TODO.md` — backend-facing gaps discovered while building the
  frontend, written from the frontend side and updated as gaps get closed.
- `frontend/HERO_IMAGE_PROMPT.md` — generation prompt for the landing hero
  background.
