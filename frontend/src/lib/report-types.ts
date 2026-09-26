export type DataMode = "demo" | "processed";

export interface ReportMetadata {
  reportId: string;
  title: string;
  subsidiary: string;
  region: string;
  period: string;
  preparedBy: string;
  classification: string;
}

export interface MiningKpis {
  coalProductionMT: number;
  coalProductionTargetMT: number;
  yoyGrowthPercent: number;
  overburdenRemovalMCuM: number;
  strippingRatio: number;
  strippingRatioTarget: number;
  inferredReservesMT: number;
  activeSeams: string[];
}

export interface PitProduction {
  pit: string;
  targetMT: number;
  actualMT: number;
}

export interface WordCloudItem {
  value: string;
  count: number;
}

export interface TopicTag {
  name: string;
  status: string;
  sentiment: "positive" | "warning" | "critical" | "neutral";
}

export interface ReportSection {
  title: string;
  content: string;
}

export interface ReportData {
  dataMode: DataMode;
  metadata: ReportMetadata;
  kpis: MiningKpis;
  productionByPit: PitProduction[];
  wordcloud: WordCloudItem[];
  topics: TopicTag[];
  executiveReport: {
    sections: ReportSection[];
  };
}

export interface DocumentRecord {
  id: string;
  fileName: string;
  size: number;
  status: "processed" | "demo" | "pending" | "failed";
}

/**
 * Shape returned by `GET /api/v1/documents` (documentController.js -> Document
 * model). This is a *different* shape from `DocumentRecord` above (which
 * mirrors the upload-response document): Mongo's `_id` instead of `id`,
 * `fileSize` instead of `size`, an `uploadedAt` timestamp, and a distinct
 * status enum. Kept as a sibling type rather than merged into
 * `DocumentRecord` to avoid making every field optional/ambiguous.
 */
export interface DocumentListItem {
  _id: string;
  /**
   * The ML service's own content-hash id (16 hex chars) — NOT the same as
   * `_id`. Required by /query's context_doc; querying with `_id` instead
   * fails ML-side validation. Null for documents uploaded before this field
   * existed, or where ML processing never completed — such documents can't
   * be used for Q&A and should be treated as non-addable to a folder's chat
   * context.
   */
  mlDocumentId: string | null;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  status: "processing" | "completed" | "failed";
  summary?: string;
  kpis?: Record<string, unknown>;
  wordCloud?: unknown[];
  topics?: unknown[];
  createdAt?: string;
  updatedAt?: string;
}

export interface DocumentsListResponse {
  success: true;
  count: number;
  documents: DocumentListItem[];
}

export interface Citation {
  source: string;
  page: number;
  /** ML content-hash id of the cited document. */
  documentId?: string;
  documentType?: "typed" | "scanned";
  /**
   * Scanned pages only: the page image exactly as sent to Gemini Vision
   * (from the ML service's per-batch JSON). Absent for typed documents or
   * when the image could not be fetched.
   */
  imageBase64?: string;
  imageMimeType?: string;
}

export interface QueryResponse {
  answer: string;
  citations: Citation[];
  dataMode: DataMode;
}

/**
 * Normalised result of `POST /api/v1/documents/upload`. `document.id` is the
 * ML document id (usable in /query's context_doc) when available, falling
 * back to the Mongo id otherwise. `documentId` is always the Mongo `_id` —
 * use THIS one for folder operations (PATCH /api/v1/folders/:id expects a
 * Mongo ObjectId, not the ML hash id). `report` is only present when the
 * backend build includes the report overlay — older deployments don't send
 * it, so callers must not rely on it.
 */
export interface UploadResponse {
  message: string;
  documentId: string | null;
  document: DocumentRecord;
  report?: ReportData;
}

/** List-view shape from `GET /api/v1/folders` — documentIds are Mongo ids, unpopulated. */
export interface FolderSummary {
  _id: string;
  name: string;
  documentIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Detail shape from `GET/POST/PATCH /api/v1/folders/:id` — documentIds are populated Document objects. */
export interface FolderDetail {
  _id: string;
  name: string;
  documentIds: DocumentListItem[];
  createdAt: string;
  updatedAt: string;
}

export interface SafeUser {
  _id: string;
  name: string;
  email: string;
  provider: "local" | "google";
  role: "user" | "admin";
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthResponse {
  success: true;
  message: string;
  user: SafeUser;
  token: string;
  redirect?: string;
}

export interface CurrentUserResponse {
  success: true;
  user: SafeUser;
}

/**
 * Chart contract emitted by the ML report pipeline
 * (`ml_service/services/chart_service.py`, version "1.0"). The same object is
 * drawn in the PDF, so keep the two renderers in step when this changes.
 *
 * - Every `data` row has a string `label` (the x value) plus one numeric key
 *   per entry in `series`; `null` means "not stated in the source" (a gap),
 *   never zero.
 * - Series order is colour order: slot N of the categorical palette always
 *   goes to `series[N]`, on screen and in the PDF.
 */
export interface ReportChartSeries {
  key: string;
  label: string;
}

export interface ReportChart {
  version: "1.0";
  id: string;
  metric: string;
  type: "bar" | "line";
  title: string;
  description: string | null;
  x_axis: { key: "label"; label: string; kind: "category" | "time" };
  y_axis: { label: string; unit: string | null; min: number | null };
  series: ReportChartSeries[];
  data: Array<{ label: string } & Record<string, number | string | null>>;
}

/** Headline number derived from a scalar statistic (stat tile / PDF "Key figures"). */
export interface ReportKpi {
  id: string;
  label: string;
  value: number;
  unit: string | null;
  metric: string;
}

export interface ReportFinding {
  finding: string;
  severity: string;
  supporting_metrics: string[];
  evidence: unknown[];
}

export interface ReportSourceDocument {
  document_id: string;
  filename: string;
}

/**
 * The generated-report shape from `ml_service/agents/report_agent.py`
 * (`_compose_report` / `_compose_content_report`) — generic, not
 * mining-specific like the old `ReportData`/`getMockReport` demo shape.
 * `report_url`, when present, is a path on the ML service (e.g.
 * `/reports/rpt_xxx/download`) — the frontend never calls it directly, only
 * via the backend's `GET /api/v1/reports/generate/:reportId/download` proxy.
 */
export interface GeneratedReport {
  title: string;
  summary: string;
  sections: ReportSection[];
  findings: ReportFinding[];
  kpis: ReportKpi[];
  charts: ReportChart[];
  sources: ReportSourceDocument[];
  limitations: string;
  report_url?: string;
}

/** Poll result from `GET /api/v1/reports/generate/:reportId`. */
export type ReportJob =
  | { report_id: string; status: "processing" }
  | { report_id: string; status: "completed"; report: GeneratedReport }
  | { report_id: string; status: "failed"; error: string };
