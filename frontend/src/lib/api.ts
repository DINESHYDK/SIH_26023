import type {
  AuthResponse,
  CurrentUserResponse,
  DocumentRecord,
  DocumentsListResponse,
  QueryResponse,
  ReportData,
  UploadResponse,
} from "@/lib/report-types";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000").replace(/\/$/, "");

interface ApiFailurePayload {
  message?: string;
  error?: {
    code?: string;
    details?: string[];
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly details: string[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getErrorMessage(payload: ApiFailurePayload | undefined, status: number): ApiError {
  const message = payload?.message || "The service could not complete this request.";
  return new ApiError(message, status, payload?.error?.code, payload?.error?.details || []);
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => undefined)) as T | ApiFailurePayload | undefined;
    if (!response.ok) {
      throw getErrorMessage(payload as ApiFailurePayload | undefined, response.status);
    }

    if (!payload) {
      throw new ApiError("The service returned an empty response.", response.status);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError("Cannot reach the API. Check that the backend is running and try again.");
  }
}

function assertReportShape(report: ReportData): ReportData {
  if (!report?.metadata?.period) {
    throw new ApiError(
      "The report service returned data in an unexpected format (missing metadata). The backend may need to be redeployed.",
    );
  }
  return report;
}

export async function getMockReport(token?: string): Promise<ReportData> {
  const report = await request<ReportData>("/api/v1/reports/mock", {}, token);
  return assertReportShape(report);
}

export function registerUser(name: string, email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
}

export function loginUser(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export function getCurrentUser(token: string): Promise<CurrentUserResponse> {
  return request<CurrentUserResponse>("/api/v1/auth/me", {}, token);
}

// Raw upload body. Newer backends send `document` + `report`; older deployments
// only spread the ML result (`document_id`, ...) next to `fileName`/`size`.
interface RawUploadResponse {
  message?: string;
  offline?: boolean;
  fileName?: string;
  size?: number;
  document_id?: string;
  document?: Partial<DocumentRecord>;
  report?: ReportData;
}

// /query's context_doc only accepts the ML service's 16-hex-char document id
const ML_DOCUMENT_ID = /^[0-9a-f]{16}$/;

export async function uploadDocument(file: File, token?: string): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const raw = await request<RawUploadResponse>(
    "/api/v1/documents/upload",
    { method: "POST", body: formData },
    token,
  );

  if (raw.offline) {
    throw new ApiError("The document was uploaded but the ML service is unavailable, so it could not be processed. Try again later.");
  }

  const id = raw.document_id || raw.document?.id;
  if (!id || !ML_DOCUMENT_ID.test(id)) {
    throw new ApiError("The document was uploaded but the ML service did not return a document id, so it can't be used for questions.");
  }

  return {
    message: raw.message || "Document processed successfully",
    document: {
      id,
      fileName: raw.document?.fileName || raw.fileName || file.name,
      size: raw.document?.size ?? raw.size ?? file.size,
      status: "processed",
    },
    // Only pass the report through when it is complete
    report: raw.report?.metadata?.period ? raw.report : undefined,
  };
}

export function submitQuery(
  query: string,
  contextDocuments: string | string[],
  token?: string,
): Promise<QueryResponse> {
  // The ML /query endpoint accepts context_doc as a single id or a
  // comma-separated list of ids, so multi-document workspace sessions can
  // pass their full contextDocIds array here without any backend changes.
  const context_doc = Array.isArray(contextDocuments)
    ? contextDocuments.join(",")
    : contextDocuments;

  return request<QueryResponse>(
    "/api/v1/query",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, context_doc }),
    },
    token,
  );
}

export function getDocuments(token?: string): Promise<DocumentsListResponse> {
  return request<DocumentsListResponse>("/api/v1/documents", {}, token);
}

/**
 * Proposed contract for a report generated from a selection of documents and
 * an optional date range: `POST /api/v1/reports/generate` ->
 * `{ documentIds, startDate?, endDate? }` returning the same `ReportData`
 * shape as `getMockReport`. This backend endpoint does not exist yet (see
 * REDESIGN_PLAN.md section 3) — callers should expect this to fail/404 and
 * fall back to `getMockReport` in the meantime.
 */
export async function generateReport(
  documentIds: string[],
  startDate?: string,
  endDate?: string,
  token?: string,
): Promise<ReportData> {
  const report = await request<ReportData>(
    "/api/v1/reports/generate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentIds, startDate, endDate }),
    },
    token,
  );
  return assertReportShape(report);
}
