"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { ProtectedPage } from "@/components/ProtectedPage";
import { LoadingPanel } from "@/components/DataState";
import { DocumentUploadDock, type SessionSource } from "@/components/dashboard/DocumentUploadDock";
import { GroundedChatDock } from "@/components/dashboard/GroundedChatDock";
import { ApiError, getDocuments, submitQuery, uploadDocument } from "@/lib/api";
import { addDocumentToFolder, getFolder, removeDocumentFromFolder, type Folder } from "@/lib/folders";
import type { DocumentListItem, QueryResponse } from "@/lib/report-types";

const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ["pdf", "xlsx", "csv", "tif", "tiff"];

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

interface WorkspaceFolderPageProps {
  params: { folderId: string };
}

export default function WorkspaceFolderPage({ params }: WorkspaceFolderPageProps) {
  const { folderId } = params;
  const { token } = useAuth();
  const router = useRouter();

  // `undefined` = not checked yet, `null` = checked and no such local folder.
  const [folder, setFolder] = useState<Folder | null | undefined>(undefined);

  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
  // Local metadata for documents this session knows about but that
  // getDocuments() hasn't (yet) returned — e.g. a file uploaded mid-session.
  const [uploadedMeta, setUploadedMeta] = useState<Record<string, { fileName: string; status?: string }>>({});
  const [isCollapsed, setIsCollapsed] = useState(false);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // When uploading more than one file, tracks sequential progress so the
  // panel can show "Uploading 2 of 4…" instead of a single opaque spinner.
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(
    null,
  );

  const [query, setQuery] = useState("");
  const [queryResponse, setQueryResponse] = useState<QueryResponse | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);

  // Folder ids live only in localStorage. A stale/bad URL should bounce back
  // to the folder grid rather than render a broken workspace.
  useEffect(() => {
    const found = getFolder(folderId) ?? null;
    setFolder(found);
    if (!found) {
      router.replace("/dashboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId]);

  // Load the user's full document list once, to resolve display names for
  // this folder's sources and to offer "add from library".
  useEffect(() => {
    let cancelled = false;
    setIsLoadingDocuments(true);

    getDocuments(token ?? undefined)
      .then((response) => {
        if (!cancelled) setDocuments(response.documents);
      })
      .catch(() => {
        // Non-fatal: the folder still works with just the ids it already
        // has, it just can't resolve display names or suggest other sources.
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDocuments(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const docMetaById = useMemo(() => {
    const map = new Map<string, { fileName: string; status?: string }>();
    documents.forEach((doc) => map.set(doc._id, { fileName: doc.fileName, status: doc.status }));
    Object.entries(uploadedMeta).forEach(([id, meta]) => map.set(id, meta));
    return map;
  }, [documents, uploadedMeta]);

  const documentIds = folder?.documentIds ?? [];

  const sources: SessionSource[] = documentIds.map((id) => ({
    id,
    fileName: docMetaById.get(id)?.fileName ?? id,
    status: docMetaById.get(id)?.status,
    isPrimary: false,
  }));

  const availableDocuments = documents.filter((doc) => !documentIds.includes(doc._id));

  const refreshFolder = () => {
    setFolder(getFolder(folderId) ?? null);
  };

  const handleAddExisting = (id: string) => {
    addDocumentToFolder(folderId, id);
    refreshFolder();
  };

  const handleRemoveSource = (id: string) => {
    removeDocumentFromFolder(folderId, id);
    refreshFolder();
  };

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    setUploadError(null);

    if (!fileList || fileList.length === 0) {
      setSelectedFiles([]);
      return;
    }

    const files = Array.from(fileList);
    const invalid = files.find((file) => {
      const extension = file.name.split(".").pop()?.toLowerCase();
      return !extension || !ACCEPTED_EXTENSIONS.includes(extension);
    });
    if (invalid) {
      setSelectedFiles([]);
      setUploadError("Select valid geological PDF, XLSX, CSV, TIF, or TIFF files.");
      event.target.value = "";
      return;
    }

    const oversized = files.find((file) => file.size > MAX_UPLOAD_SIZE_BYTES);
    if (oversized) {
      setSelectedFiles([]);
      setUploadError("Files must be 50 MB or smaller.");
      event.target.value = "";
      return;
    }

    setSelectedFiles(files);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      setUploadError("Choose a supported file before uploading.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    // Backend only accepts one file per request, so multi-file selections are
    // uploaded sequentially (not concurrently) to avoid overwhelming the
    // free-tier ML service. Each success is linked into the folder as it
    // completes; failures are surfaced but don't stop the remaining files.
    const failures: string[] = [];
    for (let index = 0; index < selectedFiles.length; index += 1) {
      const file = selectedFiles[index];
      setUploadProgress({ current: index + 1, total: selectedFiles.length });
      try {
        const response = await uploadDocument(file, token ?? undefined);
        setUploadedMeta((prev) => ({
          ...prev,
          [response.document.id]: {
            fileName: response.document.fileName,
            status: response.document.status,
          },
        }));
        addDocumentToFolder(folderId, response.document.id);
        refreshFolder();
      } catch (error) {
        failures.push(`${file.name}: ${getErrorMessage(error)}`);
      }
    }

    setUploadProgress(null);
    setSelectedFiles([]);
    setUploadError(failures.length > 0 ? failures.join(" · ") : null);
    setIsUploading(false);
  };

  const handleQuery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    if (documentIds.length === 0) {
      setQueryError("Add at least one source to this folder before asking a question.");
      return;
    }

    setIsQuerying(true);
    setQueryError(null);

    try {
      const response = await submitQuery(trimmedQuery, documentIds, token ?? undefined);
      setQueryResponse(response);
      setQuery("");
    } catch (error) {
      setQueryError(getErrorMessage(error));
    } finally {
      setIsQuerying(false);
    }
  };

  if (!folder) {
    return (
      <ProtectedPage>
        <LoadingPanel>Opening folder…</LoadingPanel>
      </ProtectedPage>
    );
  }

  return (
    <ProtectedPage>
      {/* Near-zero horizontal padding here on purpose: the sources+chat
          columns should use the full viewport width, unlike the folder
          grid page above them.

          `h-[calc(100vh-4rem)]` + `overflow-hidden` bounds the whole
          workspace to the viewport (minus the app header) so the page body
          itself never scrolls. It's a column flex container: the shared
          header row is `flex-shrink-0` (fixed height, never grows/shrinks),
          and the row below it is `flex-1 min-h-0` so it's forced to the
          remaining height instead of growing to fit its children — without
          `min-h-0` a flex child ignores its `overflow-y-auto` and just
          expands. Each column inside that row then scrolls independently
          via its own `overflow-y-auto`. */}
      <div className="flex h-[calc(100vh-4rem)] w-full flex-col overflow-hidden">
        {/* Shared full-width header: back button sits at the true left
            edge of the page (x=0), above BOTH columns, not just the chat
            column. */}
        <div className="flex shrink-0 items-center gap-space-sm border-b border-border-crisp px-space-lg py-space-md">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            title="Back to folders"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-crisp bg-surface-card text-text-secondary transition-colors hover:border-mining-gold-bright hover:text-text-primary"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-headline-md text-headline-md font-bold text-text-primary">
              {folder.name}
            </h1>
            <p className="font-mono-citation text-mono-citation text-text-muted">
              {isLoadingDocuments
                ? "Resolving source names…"
                : `${documentIds.length} source${documentIds.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <Link
            href={`/dashboard/${folderId}/reports`}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border-crisp bg-surface-card px-space-base py-2 font-body-sm font-semibold text-text-primary transition-colors hover:border-mining-gold-bright hover:text-text-primary"
          >
            <span className="material-symbols-outlined text-[18px] text-mining-gold-bright">description</span>
            Generate Report
          </Link>
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <DocumentUploadDock
            isCollapsed={isCollapsed}
            onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
            sources={sources}
            onRemoveSource={handleRemoveSource}
            availableDocuments={availableDocuments}
            onAddExisting={handleAddExisting}
            selectedFiles={selectedFiles}
            onFileSelect={handleFileSelection}
            onUpload={() => void handleUpload()}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            uploadError={uploadError}
          />

          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {documentIds.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto p-space-lg text-center">
                <div className="flex min-h-[300px] w-full max-w-md flex-col items-center justify-center rounded-xl border border-dashed border-border-crisp bg-surface-card/40 p-space-xl">
                  <span className="material-symbols-outlined mb-space-sm text-[34px] text-mining-gold-bright">
                    upload_file
                  </span>
                  <h2 className="font-headline-md text-headline-md font-bold text-text-primary">
                    This folder is empty
                  </h2>
                  <p className="mt-space-sm text-body-md text-text-secondary">
                    Add an existing document or upload a new one from the Sources panel to start a
                    grounded conversation across this folder.
                  </p>
                </div>
              </div>
            ) : (
              <GroundedChatDock
                query={query}
                onQueryChange={setQuery}
                onSubmit={handleQuery}
                isQuerying={isQuerying}
                queryResponse={queryResponse}
                queryError={queryError}
                dataMode={queryResponse?.dataMode ?? "demo"}
              />
            )}
          </main>
        </div>
      </div>
    </ProtectedPage>
  );
}
