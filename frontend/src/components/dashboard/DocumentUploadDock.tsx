"use client";

import React, { type ChangeEvent, useRef } from "react";
import type { DocumentRecord } from "@/lib/report-types";
import { formatFileSize } from "@/lib/utils";

interface DocumentUploadDockProps {
  selectedFile: File | null;
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onUpload: () => void;
  isUploading: boolean;
  uploadError: string | null;
  document: DocumentRecord | null;
}

export function DocumentUploadDock({
  selectedFile,
  onFileSelect,
  onUpload,
  isUploading,
  uploadError,
  document,
}: DocumentUploadDockProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <aside className="flex flex-col gap-space-lg rounded-xl border border-border-crisp bg-surface-dim p-space-lg">
      <div>
        <div className="flex items-center justify-between gap-space-sm border-b border-border-crisp pb-space-sm">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-[20px] text-mining-gold-bright">
              upload_file
            </span>
            <h2 className="font-headline-md text-headline-md font-bold text-text-primary">
              Add a source document
            </h2>
          </div>
        </div>
        <p className="mt-space-sm text-body-sm text-text-secondary">
          Upload one file for this session. It becomes the context for your next questions.
        </p>
      </div>

      <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border-crisp bg-surface-card/40 p-space-xl text-center transition-colors hover:border-mining-gold-bright">
        <span className="material-symbols-outlined text-[30px] text-mining-gold-bright">
          cloud_upload
        </span>
        <span className="mt-space-xs text-body-sm font-semibold text-text-primary">
          Choose a document
        </span>
        <span className="mt-1 font-mono-citation text-mono-citation text-text-muted">
          PDF, XLSX, CSV, TIF, TIFF · max 50 MB
        </span>
        <input
          ref={fileInputRef}
          type="file"
          className="sr-only"
          accept=".pdf,.xlsx,.csv,.tif,.tiff,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,image/tiff"
          onChange={onFileSelect}
        />
      </label>

      {selectedFile && (
        <div className="rounded-lg border border-border-crisp bg-surface-card p-space-md">
          <p className="truncate text-body-sm font-semibold text-text-primary">
            {selectedFile.name}
          </p>
          <p className="mt-1 font-mono-citation text-mono-citation text-text-muted">
            {formatFileSize(selectedFile.size)} · ready to upload
          </p>
        </div>
      )}

      {uploadError && (
        <p
          role="alert"
          className="rounded-lg border border-error/30 bg-error-container/20 p-space-sm text-body-sm text-error"
        >
          {uploadError}
        </p>
      )}

      <button
        type="button"
        onClick={onUpload}
        disabled={!selectedFile || isUploading}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary-container px-space-lg font-body-md font-bold text-surface-base transition-colors hover:bg-mining-gold-deep disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={`material-symbols-outlined text-[18px] ${isUploading ? "animate-spin" : ""}`}>
          {isUploading ? "progress_activity" : "upload"}
        </span>
        {isUploading ? "Uploading…" : "Upload document"}
      </button>

      <div className="border-t border-border-crisp pt-space-md">
        <h3 className="font-body-md font-semibold text-text-primary">Current session context</h3>
        {document ? (
          <div className="mt-space-sm rounded-lg border border-govtech-emerald/30 bg-govtech-emerald-dim/30 p-space-md">
            <p className="truncate text-body-sm font-semibold text-text-primary">
              {document.fileName}
            </p>
            <p className="mt-1 font-mono-citation text-mono-citation text-text-secondary">
              {formatFileSize(document.size)} · {document.status}
            </p>
          </div>
        ) : (
          <p className="mt-space-sm text-body-sm text-text-muted">
            No uploaded document yet. Questions use the BCCL report context.
          </p>
        )}
      </div>
    </aside>
  );
}
