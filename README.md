# CMPDI GeoReport AI — SIH 2026 (PS #26023)

> **Problem Statement ID:** 26023  
> **Ministry / Organization:** Ministry of Coal / Coal India Limited (CMPDI)  
> **Project:** Intelligent Geological Reporting & Parliamentary Query System

---

## 1. Project Overview

**CMPDI GeoReport AI** is an AI-powered geological reporting, analytics, and query platform engineered for the **Central Mine Planning & Design Institute (CMPDI)** and the **Ministry of Coal, Government of India**.

Coal exploration and geological evaluation involve processing complex, multi-hundred-page technical reports containing drill-hole stratigraphy, seam correlation data, coal quality grades, stripping ratios, and environmental clearance metrics. This system accelerates technical workflows by providing:
- **Multi-document Workspace:** Upload one or more geological PDFs/spreadsheets into a folder, then ask grounded questions across every document in it at once.
- **Verifiable RAG Parliamentary Q&A:** Answering technical, operational, and parliamentary queries with page-level citations, via a dual-path pipeline (native text extraction for typed PDFs, Gemini Vision for scanned ones) feeding Gemini 2.5 Flash.
- **Geological KPI Extraction & Statutory Briefs:** Structured executive reports (KPIs, pit-production tables, topics/keywords) generated per folder.
- **Zero-Downtime Offline Mode:** Resilient demo fallback serving pre-cached exploration data when a live endpoint isn't available.

---

## 2. Monorepo Structure

```
new_SIH/
├── frontend/                          # Next.js 14 App Router, TypeScript, Tailwind CSS
│   ├── src/app/                       # / (landing), /login, /try-out
│   │   └── dashboard/                 # /dashboard (folder library grid)
│   │       └── [folderId]/            # opened folder: sources + chat
│   │           └── reports/           # per-folder report generation
│   ├── src/components/                # landing/, dashboard/, ui/, Header, Footer, AuthProvider
│   ├── src/lib/                       # api.ts (backend client), report-types.ts, folders.ts
│   ├── public/hero-background.png     # landing hero background
│   └── tailwind.config.ts             # design tokens (colors, spacing, typography)
├── backend/                           # Node.js / Express API Gateway (Port 5000)
│   ├── src/{controllers,routes,models,middleware,validators}/
│   └── TODO.md                        # backend-facing gaps found from the frontend side
├── ml_service/                        # Python FastAPI & Gemini pipeline (Port 8000)
│   ├── agents/                        # ingestion (typed/scanned), query_agent, rate limiter
│   ├── cil_rag_pipeline_updated/      # scanned-PDF vision extraction + BM25/SQLite
│   └── legacy/                        # archived Phase 1 prototype, not in the live path
├── 00_Temp_Screenshots/               # UI review screenshots (working reference, not shipped)
├── REDESIGN_PLAN.md                   # frontend redesign plan this codebase was built from
├── UI_UX_REVIEW.md                    # section-by-section UI/UX review notes
├── CLAUDE.md                          # engineering conventions & current architecture notes
└── README.md                          # this file
```

---

## 3. Quick Start (Running All 3 Services)

**You need:** Node.js 18+, Python 3.10+, and MongoDB (local on `127.0.0.1:27017`, or a MongoDB Atlas URL).
**API keys:** an [OpenRouter key](https://openrouter.ai/keys) (answers questions) and a [Gemini key](https://aistudio.google.com/apikey) (OCR for scanned PDFs).

`.env` files are git-ignored, so every clone must create its own from the `.env.example` files. Start the services in this order (ML → backend → frontend), each in its own terminal.

### A. ML Service (FastAPI + Uvicorn) — Port 8000
```bash
cd ml_service
python -m venv venv
# Windows: venv\Scripts\activate | Linux/macOS: source venv/bin/activate
pip install -r requirements.txt   # large (torch); first install takes several minutes
cp .env.example .env              # set OPENROUTER_API_KEY and GEMINI_API_KEY
uvicorn main:app --port 8000 --reload
```
Run it from inside `ml_service/`. Accessible at: [http://localhost:8000](http://localhost:8000) · Docs: `/docs` · Health: `/health`

### B. Backend API Gateway (Express.js) — Port 5000
```bash
cd backend
npm install
cp .env.example .env   # set MONGO_URI and JWT_SECRET (GOOGLE_CLIENT_ID only for Google login)
npm run dev
```
Accessible at: [http://localhost:5000](http://localhost:5000) · Health check: `/api/health`

### C. Frontend (Next.js 14) — Port 3000
```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:5000" > .env.local
npm run dev
```
`.env.example` points at the deployed Render backend; `.env.local` overrides it so the frontend talks to your local backend. Restart `npm run dev` after changing it.
Accessible at: [http://localhost:3000](http://localhost:3000)

### D. Try it with real documents
`Testing/` holds public coal-sector PDFs (Ministry of Coal, CMPDI, DGMS). `Testing/TEST_QUESTIONS.md` lists questions with expected answers; `dgmscircular3_27082024.pdf` is a scanned PDF that exercises the OCR path.

---

## 4. Tech Stack Summary

| Layer | Technology | Key Libraries | Role |
| :--- | :--- | :--- | :--- |
| **Frontend** | Next.js 14 (App Router) | React 18, TypeScript, Tailwind CSS, `react-markdown` (chat answer formatting), Lucide Icons | Landing, folder-based workspace, chat, statutory reports |
| **Backend Gateway** | Node.js / Express.js | Express 4, Multer, Mongoose, Axios, JWT, Passport (Google OAuth) | Auth, document upload/list/delete, folder CRUD, ML/query proxying |
| **ML Engine** | Python 3.10+ / FastAPI | FastAPI, PyMuPDF, `sentence-transformers` + FAISS (typed PDFs), Gemini Vision + BM25/SQLite (scanned PDFs), LangGraph + LangChain | Dual-path ingestion, grounded multi-document RAG Q&A |
| **Foundation Model** | Google Gemini | `gemini-2.5-flash` | Vision extraction (scanned PDFs) and grounded answer generation |
| **Data** | MongoDB | Mongoose (`User`, `Document`, `Folder` models) | User accounts, uploaded document records, folder groupings |

> `recharts` is in `frontend/package.json` but not currently imported anywhere — the pit-production chart and KPI cards are hand-built with Tailwind, kept intentionally lightweight. Only add a charting library if a genuinely new chart type is needed later.

---

## 5. Current API Surface

All routes are mounted under `/api/v1` on the backend gateway (port 5000), which proxies document/query calls to the ML service (port 8000).

| Method | Path | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| POST | `/auth/register`, `/auth/login`, `/auth/google` | — | Account creation / sign-in |
| GET | `/auth/me` | required | Current session user |
| GET | `/documents` | required | List the current user's uploaded documents |
| POST | `/documents/upload` | optional | Upload one file (`file`) or a batch (`files`, up to 10) — proxies to ML `/process-document` |
| DELETE | `/documents/:id` | required | Delete an owned document (also unlinks it from any folders) |
| GET | `/folders` | required | List the current user's folders |
| POST | `/folders` | required | Create a folder |
| GET \| PATCH \| DELETE | `/folders/:id` | required | Read / rename+regroup / delete a folder |
| GET | `/reports/mock` | — | Canonical BCCL demo report (fixed data, used as a fallback) |
| GET | `/reports/:id/export-pdf` | required | PDF export of a single document's report |
| POST | `/query` | optional | Grounded Q&A; `context_doc` accepts one ML document id or a comma-separated list |
| GET | `/query/history` | required | Past queries for the current user |

**Two document ID systems exist and are not interchangeable:**
- MongoDB `_id` on the `Document` model — used by `GET/DELETE /documents`, and by `Folder.documentIds`.
- The ML service's own content-hash id (`document.mlDocumentId` on the same `Document` record, populated after a successful upload) — this is the **only** id `/query`'s `context_doc` accepts. A document uploaded before this field existed has `mlDocumentId: null` and can't be used for Q&A until re-uploaded.

The frontend's Workspace is fully wired to the real `/api/v1/folders` API (folders are created/listed/opened/deleted server-side, synced to your account — no more localStorage-only folders).

There is currently **no** `POST /api/v1/reports/generate` endpoint (multi-document + date-range report generation) — the Reports page's "Generate" button attempts this call and falls back to the `/reports/mock` demo data with a clear on-page banner when it 404s.

---

## 6. Environment Variables

### Frontend (`frontend/.env.example` → `frontend/.env.local`)
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000
```

### Backend (`backend/.env.example` → `backend/.env`)
```env
PORT=5000
ML_SERVICE_URL=http://localhost:8000
MONGO_URI=mongodb://127.0.0.1:27017/cmpdi_georeport
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=7d
GOOGLE_CLIENT_ID=your_google_client_id_here
```

### ML Service (`ml_service/.env.example` → `ml_service/.env`)
```env
OPENROUTER_API_KEY=your_openrouter_api_key_here   # required: answer generation
GEMINI_API_KEY=your_gemini_api_key_here           # required for scanned-PDF OCR
GEMINI_MODEL=gemini-2.5-flash
GEMINI_RPM=8                                      # match your Gemini quota; OCR and
GEMINI_RPD=20                                     # answers share this limiter
PORT=8000
```

> If the ML service or backend is unreachable, the frontend falls back to demo data (`/reports/mock`) rather than hard-failing, so the UI stays demoable offline.
