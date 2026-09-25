"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { ProtectedPage } from "@/components/ProtectedPage";
import { LoadingPanel } from "@/components/DataState";
import { DocumentUploadDock, type SessionSource } from "@/components/dashboard/DocumentUploadDock";
import { GroundedChatDock } from "@/components/dashboard/GroundedChatDock";
import { ApiError, getDocuments, getFolder, submitQuery, updateFolder, uploadDocument } from "@/lib/api";
import type { DocumentListItem, FolderDetail, QueryResponse } from "@/lib/report-types";

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

  // `undefined` = not checked yet, `null` = checked and folder not found/owned.
  const [folder, setFolder] = useState<FolderDetail | null | undefined>(undefined);
  const [folderLoadError, setFolderLoadError] = useState<string | null>(null);

  // The user's full document library, to offer "add from your library" for
  // documents not yet in this folder.
  const [libraryDocuments, setLibraryDocuments] = useState<DocumentListItem[]>([]);
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

  const loadFolder = useCallback(async () => {
    setFolderLoadError(null);
    try {
      const response = await getFolder(folderId, token ?? undefined);
      setFolder(response.folder);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 400 || error.status === 403)) {
        // Doesn't exist / not owned / bad id — bounce back to the folder grid.
        router.replace("/dashboard");
        return;
      }
      // Any other failure (network, 5xx) is likely transient — offer a retry
      // instead of kicking the user out of a folder that probably still exists.
      setFolderLoadError(getErrorMessage(error));
      setFolder(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId, token]);

  useEffect(() => {
    void loadFolder();
  }, [loadFolder]);

  // Load the user's full document list, to offer "add from library".
  useEffect(() => {
    getDocuments(token ?? undefined)
      .then((response) => setLibraryDocuments(response.documents))
      .catch(() => {
        // Non-fatal: the folder still works with the documents it already has.
      });
  }, [token]);

  const folderDocuments = folder?.documentIds ?? [];
  const folderDocumentMongoIds = folderDocuments.map((doc) => doc._id);

  // /query's context_doc needs each document's ML id, not its Mongo _id.
  // Documents without one yet (still processing, or ML failed) are simply
  // left out of the chat context rather than sent as an invalid id.
  const queryableDocumentIds = folderDocuments
    .map((doc) => doc.mlDocumentId)
    .filter((id): id is string => Boolean(id));

  const sources: SessionSource[] = folderDocuments.map((doc) => ({
    id: doc._id,
    fileName: doc.fileName,
    status: doc.mlDocumentId ? doc.status : `${doc.status} · not yet queryable`,
    isPrimary: false,
  }));

  const availableDocuments = libraryDocuments.filter(
    (doc) => !folderDocumentMongoIds.includes(doc._id),
  );

  const handleAddExisting = async (mongoDocumentId: string) => {
    try {
      const response = await updateFolder(folderId, { addDocumentIds: [mongoDocumentId] }, token ?? undefined);
      setFolder(response.folder);
    } catch (error) {
      window.alert(getErrorMessage(error));
    }
  };

  const handleRemoveSource = async (mongoDocumentId: string) => {
    try {
      const response = await updateFolder(folderId, { removeDocumentIds: [mongoDocumentId] }, token ?? undefined);
      setFolder(response.folder);
    } catch (error) {
      window.alert(getErrorMessage(error));
    }
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

    // The frontend still uploads one file per request, sequentially, to avoid
    // overwhelming the free-tier ML service — each success is attached to the
    // folder as it completes; failures are surfaced but don't stop the rest.
    const failures: string[] = [];
    for (let index = 0; index < selectedFiles.length; index += 1) {
      const file = selectedFiles[index];
      setUploadProgress({ current: index + 1, total: selectedFiles.length });
      try {
        const response = await uploadDocument(file, token ?? undefined);
        if (!response.documentId) {
          failures.push(`${file.name}: uploaded, but the server didn't return an id to add it to this folder.`);
          continue;
        }
        const updated = await updateFolder(folderId, { addDocumentIds: [response.documentId] }, token ?? undefined);
        setFolder(updated.folder);
      } catch (error) {
        failures.push(`${file.name}: ${getErrorMessage(error)}`);
      }
    }

    // Refresh the library list too, so newly uploaded files can be found via
    // "add from library" from other folders in later sessions.
    getDocuments(token ?? undefined)
      .then((response) => setLibraryDocuments(response.documents))
      .catch(() => {});

    setUploadProgress(null);
    setSelectedFiles([]);
    setUploadError(failures.length > 0 ? failures.join(" · ") : null);
    setIsUploading(false);
  };

  const handleQuery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    if (queryableDocumentIds.length === 0) {
      setQueryError("Add at least one processed source to this folder before asking a question.");
      return;
    }

    setIsQuerying(true);
    setQueryError(null);

    try {
      const response = await submitQuery(trimmedQuery, queryableDocumentIds, token ?? undefined);
      setQueryResponse(response);
      setQuery("");
    } catch (error) {
      setQueryError(getErrorMessage(error));
    } finally {
      setIsQuerying(false);
    }
  };

  if (folderLoadError) {
    return (
      <ProtectedPage>
        <div className="flex min-h-[440px] flex-col items-center justify-center gap-space-sm p-space-lg text-center">
          <span className="material-symbols-outlined text-[34px] text-state-critical">cloud_off</span>
          <h1 className="font-headline-lg text-headline-lg font-bold text-text-primary">Couldn't open this folder</h1>
          <p className="max-w-md text-body-md text-text-secondary">{folderLoadError}</p>
          <button
            type="button"
            onClick={() => void loadFolder()}
            className="mt-space-sm inline-flex items-center gap-2 rounded-lg bg-primary-container px-space-lg py-2.5 font-body-md font-bold text-surface-base transition-colors hover:bg-mining-gold-deep"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Retry
          </button>
        </div>
      </ProtectedPage>
    );
  }

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
              {folderDocuments.length} source{folderDocuments.length === 1 ? "" : "s"}
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
            onRemoveSource={(id) => void handleRemoveSource(id)}
            availableDocuments={availableDocuments}
            onAddExisting={(id) => void handleAddExisting(id)}
            selectedFiles={selectedFiles}
            onFileSelect={handleFileSelection}
            onUpload={() => void handleUpload()}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            uploadError={uploadError}
          />

          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {folderDocuments.length === 0 ? (
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
