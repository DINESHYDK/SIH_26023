"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, downloadGeneratedReportPdf, getFolder, getReportStatus, startReportGeneration } from "@/lib/api";
import type { DocumentListItem, FolderDetail, GeneratedReport } from "@/lib/report-types";
import { useAuth } from "@/components/AuthProvider";
import { ProtectedPage } from "@/components/ProtectedPage";
import { LoadingPanel } from "@/components/DataState";
import { ReportChartView } from "@/components/dashboard/ReportChartView";

type GeneratePhase = "idle" | "processing" | "ready" | "error";

const POLL_INTERVAL_MS = 2500;

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }
  return fallback;
}

function formatKpiValue(value: number, unit: string | null): string {
  const text = Number.isInteger(value) ? value.toLocaleString("en-IN") : value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return unit === "%" ? `${text}%` : unit ? `${text} ${unit}` : text;
}

function formatUploadDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown date";
  return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Selection UI: pick which of the folder's documents to build a report from
 * (only documents with an `mlDocumentId` are selectable — that's the id
 * `/generate-report`'s `file_ids` requires, the same as /query's context_doc),
 * an instruction describing what to analyse, and optionally a date range.
 */
function ReportSelectionPanel({
  documents,
  selectedIds,
  onToggleDocument,
  instruction,
  onInstructionChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onGenerate,
  isGenerating,
  validationError,
}: {
  documents: DocumentListItem[];
  selectedIds: string[];
  onToggleDocument: (mlDocumentId: string) => void;
  instruction: string;
  onInstructionChange: (value: string) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  validationError: string | null;
}) {
  const queryableDocuments = documents.filter((doc): doc is DocumentListItem & { mlDocumentId: string } => Boolean(doc.mlDocumentId));
  const notYetQueryable = documents.length - queryableDocuments.length;

  return (
    <section className="rounded-xl border border-border-crisp bg-surface-card p-space-lg shadow-sm">
      <h2 className="font-headline-md text-headline-md font-bold text-text-primary">
        Generate a report
      </h2>
      <p className="mt-space-xs font-body-sm text-body-sm text-text-secondary">
        Select this folder&apos;s source documents (or a date range) and describe what to analyse.
      </p>

      <div className="mt-space-lg grid gap-space-lg lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="font-mono-label text-mono-label uppercase text-text-muted">
            Source documents {selectedIds.length > 0 && `(${selectedIds.length} selected)`}
          </p>

          {queryableDocuments.length === 0 ? (
            <div className="mt-space-sm rounded-lg border border-dashed border-border-crisp bg-surface-base p-space-base font-body-sm text-body-sm text-text-secondary">
              None of this folder&apos;s documents are processed yet — reports can only use documents that finished ML processing.
            </div>
          ) : (
            <div className="mt-space-sm max-h-64 divide-y divide-border-subtle overflow-y-auto rounded-lg border border-border-subtle bg-surface-base">
              {queryableDocuments.map((doc) => {
                const checked = selectedIds.includes(doc.mlDocumentId);
                return (
                  <label
                    key={doc._id}
                    className="flex cursor-pointer items-center gap-space-sm p-space-sm transition-colors hover:bg-surface-hover"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleDocument(doc.mlDocumentId)}
                      className="h-4 w-4 shrink-0 rounded border-border-crisp accent-mining-gold-bright"
                    />
                    <span className="material-symbols-outlined text-[20px] text-mining-gold-bright">
                      description
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-body-sm font-semibold text-text-primary">
                        {doc.fileName}
                      </span>
                      <span className="block font-mono-citation text-mono-citation text-text-muted">
                        Uploaded {formatUploadDate(doc.uploadedAt)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          {notYetQueryable > 0 && (
            <p className="mt-space-xs font-mono-citation text-mono-citation text-text-muted">
              {notYetQueryable} other document{notYetQueryable === 1 ? "" : "s"} in this folder can&apos;t be used yet (still processing or failed).
            </p>
          )}

          <label className="mt-space-base flex flex-col gap-1.5 font-body-sm text-text-secondary">
            What should the report analyse?
            <textarea
              value={instruction}
              onChange={(event) => onInstructionChange(event.target.value)}
              rows={3}
              placeholder="e.g. Summarize key findings and chart trends across these documents"
              className="rounded-lg border border-border-crisp bg-surface-base px-3 py-2 text-text-primary outline-none focus:border-mining-gold-bright"
            />
          </label>
        </div>

        <div className="flex flex-col gap-space-base">
          <div>
            <p className="font-mono-label text-mono-label uppercase text-text-muted">
              Reporting period <span className="normal-case text-text-muted">(instead of picking documents)</span>
            </p>
            <div className="mt-space-sm flex flex-col gap-space-sm">
              <label className="flex flex-col gap-1.5 font-body-sm text-text-secondary">
                Start date
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => onStartDateChange(event.target.value)}
                  className="date-input cursor-pointer rounded-lg border border-border-crisp bg-surface-base px-3 py-2 text-text-primary outline-none focus:border-mining-gold-bright"
                />
              </label>
              <label className="flex flex-col gap-1.5 font-body-sm text-text-secondary">
                End date
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => onEndDateChange(event.target.value)}
                  className="date-input cursor-pointer rounded-lg border border-border-crisp bg-surface-base px-3 py-2 text-text-primary outline-none focus:border-mining-gold-bright"
                />
              </label>
            </div>
          </div>

          {validationError && (
            <p className="font-body-sm text-body-sm text-state-critical">{validationError}</p>
          )}

          <button
            type="button"
            onClick={onGenerate}
            disabled={isGenerating}
            className="mt-auto inline-flex items-center justify-center gap-space-xs rounded-lg bg-primary-container px-space-lg py-2.5 font-body-md font-bold text-surface-base transition-colors hover:bg-mining-gold-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className={`material-symbols-outlined text-[18px] ${isGenerating ? "animate-spin" : ""}`}>
              {isGenerating ? "progress_activity" : "auto_awesome"}
            </span>
            {isGenerating ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>
    </section>
  );
}

/** Renders a completed GeneratedReport: KPI tiles, charts, sections, findings, sources. */
function GeneratedReportView({ report, reportId, token }: { report: GeneratedReport; reportId: string; token: string | null }) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = async () => {
    setIsDownloading(true);
    setDownloadError(null);
    try {
      await downloadGeneratedReportPdf(reportId, token ?? undefined);
    } catch (error) {
      setDownloadError(getErrorMessage(error, "Could not download the PDF."));
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="mt-space-xl">
      <div className="mb-space-xl flex flex-col gap-space-base border-b border-border-subtle pb-space-lg lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="font-mono-label text-mono-label uppercase tracking-wider text-mining-gold-bright">
            Generated Report
          </span>
          <h1 className="mt-space-sm font-headline-lg text-headline-lg font-bold tracking-tight text-text-primary">
            {report.title}
          </h1>
          <p className="mt-space-xs max-w-2xl font-body-md text-body-md text-text-secondary">{report.summary}</p>
        </div>
        <div className="flex flex-col items-end gap-space-xs">
          <button
            className="inline-flex items-center justify-center gap-space-xs rounded-lg bg-surface-card px-space-lg py-2 font-body-sm font-semibold text-text-primary shadow-sm transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void handleDownload()}
            disabled={isDownloading}
            type="button"
          >
            <span className={`material-symbols-outlined text-[18px] ${isDownloading ? "animate-spin" : ""}`}>
              {isDownloading ? "progress_activity" : "picture_as_pdf"}
            </span>
            {isDownloading ? "Preparing…" : "Download PDF"}
          </button>
          {downloadError && <p className="font-body-sm text-body-sm text-state-critical">{downloadError}</p>}
        </div>
      </div>

      {report.kpis.length > 0 && (
        <section className="mb-space-xl grid gap-space-sm sm:grid-cols-2 xl:grid-cols-4">
          {report.kpis.map((kpi) => (
            <div className="rounded-lg border border-border-crisp bg-surface-card p-space-base" key={kpi.id}>
              <p className="font-mono-label text-mono-label uppercase text-text-muted">{kpi.label}</p>
              <p className="mt-space-xs font-mono-metric-lg text-mono-metric-lg text-mining-gold-bright">
                {formatKpiValue(kpi.value, kpi.unit)}
              </p>
            </div>
          ))}
        </section>
      )}

      {report.charts.length > 0 && (
        <section className="mb-space-xl grid gap-space-lg lg:grid-cols-2">
          {report.charts.map((chart) => (
            <ReportChartView key={chart.id} chart={chart} />
          ))}
        </section>
      )}

      <article className="rounded-xl bg-surface-card p-space-base shadow-xl sm:p-space-2xl">
        <section>
          <div className="space-y-space-lg">
            {report.sections.map((section) => (
              <section className="border-l-2 border-mining-gold-bright pl-space-base" key={section.title}>
                <h3 className="font-body-md text-body-md font-bold text-text-primary">{section.title}</h3>
                <p className="mt-space-xs font-body-md text-body-md leading-relaxed text-text-secondary">{section.content}</p>
              </section>
            ))}
          </div>
        </section>

        {report.findings.length > 0 && (
          <section className="mt-space-2xl">
            <h2 className="font-headline-md text-headline-md font-bold text-text-primary">Findings</h2>
            <ul className="mt-space-md space-y-space-xs">
              {report.findings.map((item, index) => (
                <li key={index} className="rounded-lg bg-surface-base p-space-sm font-body-sm text-body-sm text-text-secondary">
                  {item.finding}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-space-2xl grid gap-space-xl lg:grid-cols-2">
          <div>
            <h2 className="font-headline-md text-headline-md font-bold text-text-primary">Sources</h2>
            <ul className="mt-space-md space-y-space-xs">
              {report.sources.map((source) => (
                <li key={source.document_id} className="rounded-lg bg-surface-base p-space-sm font-body-sm text-body-sm text-text-primary">
                  {source.filename}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-headline-md text-headline-md font-bold text-text-primary">Limitations</h2>
            <p className="mt-space-md rounded-lg bg-surface-base p-space-sm font-body-sm text-body-sm text-text-secondary">
              {report.limitations}
            </p>
          </div>
        </section>
      </article>
    </div>
  );
}

interface FolderReportsPageProps {
  params: { folderId: string };
}

function FolderReportsContent({ folderId }: { folderId: string }) {
  const { token } = useAuth();
  const router = useRouter();

  // `undefined` = not checked yet, `null` = checked and folder not found/owned
  // — same pattern as the workspace page at [folderId]/page.tsx.
  const [folder, setFolder] = useState<FolderDetail | null | undefined>(undefined);
  const [folderLoadError, setFolderLoadError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [instruction, setInstruction] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const [phase, setPhase] = useState<GeneratePhase>("idle");
  const [reportId, setReportId] = useState<string | null>(null);
  const [report, setReport] = useState<GeneratedReport | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const pollHandle = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadFolder = useCallback(async () => {
    setFolderLoadError(null);
    try {
      const response = await getFolder(folderId, token ?? undefined);
      setFolder(response.folder);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 400 || error.status === 403)) {
        router.replace("/dashboard");
        return;
      }
      setFolderLoadError(getErrorMessage(error, "This folder could not be loaded."));
      setFolder(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId, token]);

  useEffect(() => {
    void loadFolder();
  }, [loadFolder]);

  // Stop polling if the component unmounts mid-generation.
  useEffect(() => {
    return () => {
      if (pollHandle.current) clearInterval(pollHandle.current);
    };
  }, []);

  const documents: DocumentListItem[] = folder?.documentIds ?? [];

  const toggleDocument = (mlDocumentId: string) => {
    setSelectedIds((prev) =>
      prev.includes(mlDocumentId) ? prev.filter((existing) => existing !== mlDocumentId) : [...prev, mlDocumentId],
    );
  };

  const pollReport = useCallback(
    (id: string) => {
      pollHandle.current = setInterval(async () => {
        try {
          const job = await getReportStatus(id, token ?? undefined);
          if (job.status === "completed") {
            if (pollHandle.current) clearInterval(pollHandle.current);
            setReport(job.report);
            setPhase("ready");
          } else if (job.status === "failed") {
            if (pollHandle.current) clearInterval(pollHandle.current);
            setGenerateError(job.error || "The report could not be generated.");
            setPhase("error");
          }
          // status === "processing": keep polling.
        } catch (error) {
          if (pollHandle.current) clearInterval(pollHandle.current);
          setGenerateError(getErrorMessage(error, "Lost connection while generating the report."));
          setPhase("error");
        }
      }, POLL_INTERVAL_MS);
    },
    [token],
  );

  const handleGenerate = useCallback(async () => {
    setValidationError(null);

    const hasDateRange = Boolean(startDate && endDate);
    if (selectedIds.length === 0 && !hasDateRange) {
      setValidationError("Select at least one document, or provide both a start and end date.");
      return;
    }

    if (!token) {
      setGenerateError("Your session is unavailable. Please sign in again.");
      setPhase("error");
      return;
    }

    setPhase("processing");
    setGenerateError(null);
    setReport(null);

    try {
      const job = await startReportGeneration(selectedIds, startDate || undefined, endDate || undefined, instruction || undefined, token);
      setReportId(job.report_id);
      pollReport(job.report_id);
    } catch (error) {
      setGenerateError(getErrorMessage(error, "The report could not be started. Please try again."));
      setPhase("error");
    }
  }, [token, selectedIds, startDate, endDate, instruction, pollReport]);

  if (folderLoadError) {
    return (
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
    );
  }

  if (!folder) {
    return <LoadingPanel>Opening folder…</LoadingPanel>;
  }

  const folderIsEmpty = documents.length === 0;

  return (
    <main className="mx-auto w-full max-w-[1440px] px-space-base py-space-xl sm:px-space-xl">
      <header className="mb-space-lg">
        <Link
          href={`/dashboard/${folderId}`}
          className="mb-space-sm inline-flex items-center gap-1.5 font-mono-citation text-mono-citation text-text-muted transition-colors hover:text-mining-gold-bright"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Back to {folder.name}
        </Link>
        <h1 className="font-headline-lg text-headline-lg font-bold text-text-primary">
          Reports
        </h1>
        <p className="mt-space-xs font-body-md text-body-md text-text-secondary">
          Choose from {folder.name}&apos;s source documents, describe what to analyse, then generate a report.
        </p>
      </header>

      {folderIsEmpty ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-border-crisp bg-surface-card/40 p-space-xl text-center">
          <span className="material-symbols-outlined mb-space-sm text-[34px] text-mining-gold-bright">
            upload_file
          </span>
          <h2 className="font-headline-md text-headline-md font-bold text-text-primary">
            This folder has no sources yet
          </h2>
          <p className="mt-space-sm max-w-md font-body-md text-body-md text-text-secondary">
            Add at least one document to &quot;{folder.name}&quot; before generating a report.
          </p>
          <Link
            href={`/dashboard/${folderId}`}
            className="mt-space-lg inline-flex items-center gap-space-xs rounded-lg bg-primary-container px-space-lg py-2.5 font-body-md font-bold text-surface-base transition-colors hover:bg-mining-gold-deep"
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            Add sources to this folder
          </Link>
        </div>
      ) : (
        <>
          <ReportSelectionPanel
            documents={documents}
            selectedIds={selectedIds}
            onToggleDocument={toggleDocument}
            instruction={instruction}
            onInstructionChange={setInstruction}
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onGenerate={() => void handleGenerate()}
            isGenerating={phase === "processing"}
            validationError={validationError}
          />

          {phase === "processing" && (
            <div className="mt-space-xl flex flex-col items-center justify-center gap-space-sm rounded-xl border border-border-crisp bg-surface-card p-space-2xl text-center">
              <span className="material-symbols-outlined animate-spin text-[32px] text-mining-gold-bright">
                progress_activity
              </span>
              <h2 className="font-headline-md text-headline-md font-bold text-text-primary">Generating report</h2>
              <p className="font-body-sm text-body-sm text-text-secondary">
                This can take a little while — analysing documents and building charts.
              </p>
            </div>
          )}

          {phase === "error" && (
            <section className="mt-space-xl rounded-xl border border-state-critical/30 bg-surface-card p-space-xl text-center shadow-lg">
              <span className="material-symbols-outlined text-[36px] text-state-critical">error</span>
              <h2 className="mt-space-sm font-headline-md text-headline-md font-bold text-text-primary">
                Report generation failed
              </h2>
              <p className="mx-auto mt-space-sm max-w-xl font-body-sm text-body-sm text-text-secondary">
                {generateError ?? "The report service did not return a report."}
              </p>
              <button
                className="mt-space-lg inline-flex items-center gap-space-xs rounded-lg bg-primary-container px-space-lg py-2 font-body-sm font-bold text-surface-base transition-colors hover:bg-mining-gold-deep"
                onClick={() => void handleGenerate()}
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
                Retry
              </button>
            </section>
          )}

          {phase === "ready" && report && reportId && (
            <GeneratedReportView report={report} reportId={reportId} token={token} />
          )}
        </>
      )}
    </main>
  );
}

export default function FolderReportsPage({ params }: FolderReportsPageProps) {
  const { folderId } = params;

  return (
    <ProtectedPage>
      <FolderReportsContent folderId={folderId} />
    </ProtectedPage>
  );
}
