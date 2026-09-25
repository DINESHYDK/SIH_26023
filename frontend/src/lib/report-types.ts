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
}

export interface QueryResponse {
  answer: string;
  citations: Citation[];
  dataMode: DataMode;
}

export interface UploadResponse {
  message: string;
  document: DocumentRecord;
  report: ReportData;
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
