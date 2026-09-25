"use client";

import React, { type ChangeEvent, useRef } from "react";
import type { DocumentListItem } from "@/lib/report-types";
import { formatFileSize } from "@/lib/utils";

export interface SessionSource {
  id: string;
  fileName: string;
  /** Loosely typed: primary/added sources can come from either the
   * GET /api/v1/documents status enum or the upload-response status enum. */
  status?: string;
  isPrimary: boolean;
}

interface DocumentUploadDockProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  sources: SessionSource[];
  onRemoveSource: (documentId: string) => void;
  availableDocuments: DocumentListItem[];
  onAddExisting: (documentId: string) => void;
  selectedFiles: File[];
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onUpload: () => void;
  isUploading: boolean;
  /** Sequential per-file upload progress, e.g. { current: 2, total: 4 }. */
  uploadProgress: { current: number; total: number } | null;
  uploadError: string | null;
}

function statusTone(status?: string): string {
  switch (status) {
    case "completed":
      return "text-govtech-emerald";
    case "failed":
      return "text-state-critical";
    default:
      return "text-mining-gold-bright";
  }
}

/**
 * The sources panel for an opened workspace folder. Repurposed from the
 * previous single-file "upload dock" into a NotebookLM-style sources list:
 * it shows every document that belongs to this folder, and lets the user add
 * more either by picking an already-uploaded document (no network call
 * needed) or uploading a new one. Removing a source only unlinks it from the
 * folder locally — the underlying uploaded document is not deleted.
 */
export function DocumentUploadDock({
  isCollapsed,
  onToggleCollapse,
  sources,
  onRemoveSource,
  availableDocuments,
  onAddExisting,
  selectedFiles,
  onFileSelect,
  onUpload,
  isUploading,
  uploadProgress,
  uploadError,
}: DocumentUploadDockProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (isCollapsed) {
    return (
      <aside className="flex h-full w-14 shrink-0 flex-col items-center gap-space-md overflow-y-auto border-r border-border-crisp bg-surface-dim py-space-md">
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Expand sources panel"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-crisp bg-surface-card text-text-secondary transition-colors hover:border-mining-gold-bright hover:text-text-primary"
        >
          <span className="material-symbols-outlined text-[20px]">chevron_right</span>
        </button>
        <span className="material-symbols-outlined text-[20px] text-mining-gold-bright">
          folder_open
        </span>
        <span className="font-mono-citation text-mono-citation text-text-muted">
          {sources.length}
        </span>
      </aside>
    );
  }

  return (
    // `h-full min-h-0`: this aside is a flex item of the two-column row in
    // [folderId]/page.tsx (which is itself `flex-1 min-h-0` inside the
    // page's fixed-height column). `min-h-0` here stops the aside's own
    // content from forcing it taller than that bounded height, which is
    // what let the sources panel's scroll leak into the page before.
    <aside className="flex h-full min-h-0 w-80 shrink-0 flex-col overflow-hidden border-r border-border-crisp bg-surface-dim">
      <div className="flex shrink-0 items-center justify-between gap-space-sm border-b border-border-crisp p-space-lg">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-[20px] text-mining-gold-bright">
            folder_open
          </span>
          <h2 className="font-headline-md text-headline-md font-bold text-text-primary">Sources</h2>
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Collapse sources panel"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-crisp bg-surface-card text-text-secondary transition-colors hover:border-mining-gold-bright hover:text-text-primary"
        >
          <span className="material-symbols-outlined text-[18px]">chevron_left</span>
        </button>
      </div>

      {/* This is the panel's own independent scroll container: min-h-0 +
          flex-1 + overflow-y-auto. Scrolling here never touches the chat
          column's scroll, since the two are separate overflow contexts. */}
      <div className="min-h-0 flex-1 overflow-y-auto p-space-lg">
        {/* Active session sources */}
        <ul className="flex flex-col gap-space-sm">
          {sources.map((source) => (
            <li
              key={source.id}
              className={`rounded-lg border p-space-md ${
                source.isPrimary
                  ? "border-mining-gold-bright/40 bg-mining-gold-bright/10"
                  : "border-border-crisp bg-surface-card"
              }`}
            >
              <div className="flex items-start justify-between gap-space-sm">
                <div className="min-w-0">
                  <p className="truncate text-body-sm font-semibold text-text-primary">
                    {source.fileName}
                  </p>
                  <p className={`mt-1 font-mono-citation text-mono-citation ${statusTone(source.status)}`}>
                    {source.isPrimary ? "Primary document" : source.status ?? "In this folder"}
                  </p>
                </div>
                {!source.isPrimary && (
                  <button
                    type="button"
                    onClick={() => onRemoveSource(source.id)}
                    title="Remove from folder (keeps the uploaded document)"
                    className="shrink-0 text-text-muted transition-colors hover:text-state-critical"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {/* Upload one or more brand-new documents into this session. Placed
            above "Add from your library" per the requested ordering. */}
        <div className="mt-space-lg border-t border-border-crisp pt-space-md">
          <h3 className="font-body-sm font-semibold text-text-primary">Upload a new document</h3>
          <label className="mt-space-sm flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border-crisp bg-surface-card/40 p-space-lg text-center transition-colors hover:border-mining-gold-bright">
            <span className="material-symbols-outlined text-[26px] text-mining-gold-bright">
              cloud_upload
            </span>
            <span className="mt-space-xs text-body-sm font-semibold text-text-primary">
              Choose one or more documents
            </span>
            <span className="mt-1 font-mono-citation text-mono-citation text-text-muted">
              PDF, XLSX, CSV, TIF, TIFF · max 50 MB each
            </span>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="sr-only"
              accept=".pdf,.xlsx,.csv,.tif,.tiff,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,image/tiff"
              onChange={onFileSelect}
            />
          </label>

          {selectedFiles.length > 0 && (
            <ul className="mt-space-sm flex flex-col gap-space-xs">
              {selectedFiles.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="rounded-lg border border-border-crisp bg-surface-card p-space-sm"
                >
                  <p className="truncate text-body-sm font-semibold text-text-primary">
                    {file.name}
                  </p>
                  <p className="mt-1 font-mono-citation text-mono-citation text-text-muted">
                    {formatFileSize(file.size)} · ready to upload
                  </p>
                </li>
              ))}
            </ul>
          )}

          {uploadError && (
            <p
              role="alert"
              className="mt-space-sm rounded-lg border border-error/30 bg-error-container/20 p-space-sm text-body-sm text-error"
            >
              {uploadError}
            </p>
          )}

          <button
            type="button"
            onClick={onUpload}
            disabled={selectedFiles.length === 0 || isUploading}
            className="mt-space-sm inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary-container px-space-lg font-body-md font-bold text-surface-base transition-colors hover:bg-mining-gold-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-[18px] ${isUploading ? "animate-spin" : ""}`}>
              {isUploading ? "progress_activity" : "upload"}
            </span>
            {isUploading
              ? uploadProgress
                ? `Uploading ${uploadProgress.current} of ${uploadProgress.total}…`
                : "Uploading…"
              : selectedFiles.length > 1
                ? `Upload ${selectedFiles.length} files & add to folder`
                : "Upload & add to folder"}
          </button>
        </div>

        {/* Add an already-uploaded document to this session's context */}
        {availableDocuments.length > 0 && (
          <div className="mt-space-lg border-t border-border-crisp pt-space-md">
            <h3 className="font-body-sm font-semibold text-text-primary">Add from your library</h3>
            <ul className="mt-space-sm flex flex-col gap-space-xs">
              {availableDocuments.map((doc) => (
                <li key={doc._id}>
                  <button
                    type="button"
                    onClick={() => doc.mlDocumentId && onAddExisting(doc.mlDocumentId)}
                    className="flex w-full items-center justify-between gap-space-sm rounded-lg border border-border-crisp bg-surface-card px-space-sm py-space-xs text-left transition-colors hover:border-mining-gold-bright"
                  >
                    <span className="truncate text-body-sm text-text-secondary">{doc.fileName}</span>
                    <span className="material-symbols-outlined shrink-0 text-[16px] text-mining-gold-bright">
                      add
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </aside>
  );
}
