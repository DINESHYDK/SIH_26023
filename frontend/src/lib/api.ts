import type {
  AuthResponse,
  CurrentUserResponse,
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

export function getMockReport(token?: string): Promise<ReportData> {
  return request<ReportData>("/api/v1/reports/mock", {}, token);
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

export function uploadDocument(file: File, token?: string): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  return request<UploadResponse>(
    "/api/v1/documents/upload",
    { method: "POST", body: formData },
    token,
  );
}

export function submitQuery(query: string, contextDocument: string, token?: string): Promise<QueryResponse> {
  return request<QueryResponse>(
    "/api/v1/query",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, context_doc: contextDocument }),
    },
    token,
  );
}
