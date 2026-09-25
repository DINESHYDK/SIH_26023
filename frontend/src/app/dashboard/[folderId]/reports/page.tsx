"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, generateReport, getDocuments, getMockReport } from "@/lib/api";
import type { DocumentListItem, ReportData } from "@/lib/report-types";
import { useAuth } from "@/components/AuthProvider";
import { ProtectedPage } from "@/components/ProtectedPage";
import { LoadingPanel } from "@/components/DataState";
import { getFolder, type Folder } from "@/lib/folders";

type GeneratePhase = "idle" | "loading" | "ready" | "error";

const numberFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});

function displayNumber(value: number) {
  return numberFormatter.format(value);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }
  return fallback;
}

function topicColors(sentiment: ReportData["topics"][number]["sentiment"]) {
  switch (sentiment) {
    case "positive":
      return "bg-govtech-emerald-dim text-govtech-emerald border-govtech-emerald/30";
    case "warning":
      return "bg-state-warning/15 text-state-warning border-state-warning/30";
    case "critical":
      return "bg-state-critical/15 text-state-critical border-state-critical/30";
    default:
      return "bg-surface-hover text-text-secondary border-border-crisp";
  }
}

function documentStatusBadgeClasses(status: DocumentListItem["status"]): string {
  switch (status) {
    case "completed":
      return "border-govtech-emerald/40 bg-govtech-emerald-dim text-govtech-emerald";
    case "failed":
      return "border-state-critical/40 bg-state-critical/10 text-state-critical";
    default:
      return "border-mining-gold-bright/40 bg-mining-gold-bright/10 text-mining-gold-bright";
  }
}

function documentStatusLabel(status: DocumentListItem["status"]): string {
  switch (status) {
    case "completed":
      return "Processed";
    case "failed":
      return "Failed";
    default:
      return "Processing";
  }
}

function formatUploadDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown date";
  return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Selection UI: pick which of the folder's documents (and, optionally, a
 * date range) to build a decision brief from. Sits above the report render
 * and drives the "Generate" flow. Identical to the pre-rebuild standalone
 * /reports page, except the `documents` list passed in is now pre-filtered
 * to the opened folder's documentIds by the parent component below.
 */
function ReportSelectionPanel({
  documents,
  documentsLoading,
  documentsError,
  onRetryDocuments,
  selectedIds,
  onToggleDocument,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onGenerate,
  isGenerating,
}: {
  documents: DocumentListItem[];
  documentsLoading: boolean;
  documentsError: string | null;
  onRetryDocuments: () => void;
  selectedIds: string[];
  onToggleDocument: (id: string) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}) {
  return (
    <section className="rounded-xl border border-border-crisp bg-surface-card p-space-lg shadow-sm">
      <h2 className="font-headline-md text-headline-md font-bold text-text-primary">
        Build a decision brief
      </h2>
      <p className="mt-space-xs font-body-sm text-body-sm text-text-secondary">
        Select this folder&apos;s source documents and, optionally, a reporting date range, then generate a brief.
      </p>

      <div className="mt-space-lg grid gap-space-lg lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="font-mono-label text-mono-label uppercase text-text-muted">
            Source documents {selectedIds.length > 0 && `(${selectedIds.length} selected)`}
          </p>

          {documentsLoading ? (
            <div className="mt-space-sm flex items-center gap-space-sm rounded-lg border border-border-subtle bg-surface-base p-space-base text-text-secondary">
              <span className="material-symbols-outlined animate-spin text-[18px] text-mining-gold-bright">
                progress_activity
              </span>
              <span className="font-body-sm text-body-sm">Loading this folder&apos;s documents…</span>
            </div>
          ) : documentsError ? (
            <div className="mt-space-sm flex flex-col items-start gap-space-sm rounded-lg border border-state-critical/30 bg-state-critical/10 p-space-base">
              <p className="font-body-sm text-body-sm text-state-critical">{documentsError}</p>
              <button
                type="button"
                onClick={onRetryDocuments}
                className="inline-flex items-center gap-1.5 rounded-lg bg-surface-card px-space-sm py-1.5 font-body-sm font-semibold text-text-primary transition-colors hover:bg-surface-hover"
              >
                <span className="material-symbols-outlined text-[16px]">refresh</span>
                Retry
              </button>
            </div>
          ) : documents.length === 0 ? (
            <div className="mt-space-sm rounded-lg border border-dashed border-border-crisp bg-surface-base p-space-base font-body-sm text-body-sm text-text-secondary">
              None of this folder&apos;s documents could be resolved from your library yet.
            </div>
          ) : (
            <div className="mt-space-sm max-h-64 divide-y divide-border-subtle overflow-y-auto rounded-lg border border-border-subtle bg-surface-base">
              {documents.map((doc) => {
                const checked = selectedIds.includes(doc._id);
                return (
                  <label
                    key={doc._id}
                    className="flex cursor-pointer items-center gap-space-sm p-space-sm transition-colors hover:bg-surface-hover"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleDocument(doc._id)}
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
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 font-mono-citation text-mono-citation font-semibold ${documentStatusBadgeClasses(
                        doc.status,
                      )}`}
                    >
                      {documentStatusLabel(doc.status)}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-space-base">
          <div>
            <p className="font-mono-label text-mono-label uppercase text-text-muted">Reporting period</p>
            <div className="mt-space-sm flex flex-col gap-space-sm">
              <label className="flex flex-col gap-1.5 font-body-sm text-text-secondary">
                Start date
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => onStartDateChange(event.target.value)}
                  className="rounded-lg border border-border-crisp bg-surface-base px-3 py-2 text-text-primary outline-none focus:border-mining-gold-bright"
                />
              </label>
              <label className="flex flex-col gap-1.5 font-body-sm text-text-secondary">
                End date
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => onEndDateChange(event.target.value)}
                  className="rounded-lg border border-border-crisp bg-surface-base px-3 py-2 text-text-primary outline-none focus:border-mining-gold-bright"
                />
              </label>
            </div>
          </div>

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

/** The actual report render: KPI cards, pit-production table, executive
 * report sections, topics/keywords. Reused as-is from the pre-rebuild page —
 * only the surrounding selection/generate flow above it is new. */
function ReportDisplay({ report, fallbackNotice }: { report: ReportData; fallbackNotice: string | null }) {
  const { metadata, kpis, productionByPit, topics, executiveReport, wordcloud, dataMode } = report;
  const isDemoData = dataMode === "demo";
  const showDemoBanner = isDemoData || Boolean(fallbackNotice);
  const bannerText =
    fallbackNotice ??
    "This view is using the canonical BCCL demonstration report. It is not a newly processed document.";

  const kpiCards = [
    {
      label: "Coal Production",
      value: `${displayNumber(kpis.coalProductionMT)} MT`,
      detail: `Target ${displayNumber(kpis.coalProductionTargetMT)} MT · ${displayNumber(kpis.yoyGrowthPercent)}% YoY`,
      tone: "text-mining-gold-bright",
    },
    {
      label: "Overburden Removed (OBR)",
      value: `${displayNumber(kpis.overburdenRemovalMCuM)} M.Cu.M`,
      detail: "Quarterly reported removal",
      tone: "text-text-primary",
    },
    {
      label: "Stripping Ratio",
      value: displayNumber(kpis.strippingRatio),
      detail: `Target ${displayNumber(kpis.strippingRatioTarget)}`,
      tone: "text-tertiary-container",
    },
    {
      label: "Inferred Coking Coal Resources",
      value: `${displayNumber(kpis.inferredReservesMT)} MT`,
      detail: kpis.activeSeams.join(" · "),
      tone: "text-govtech-emerald",
    },
  ];

  return (
    <div className="mt-space-xl">
      <div className="mb-space-xl flex flex-col gap-space-base border-b border-border-subtle pb-space-lg lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-space-sm">
            <span className="font-mono-label text-mono-label uppercase tracking-wider text-mining-gold-bright">
              Decision Brief
            </span>
            <span
              className={`rounded border px-space-sm py-1 font-mono-citation text-mono-citation font-semibold ${
                isDemoData
                  ? "border-state-warning/30 bg-state-warning/15 text-state-warning"
                  : "border-govtech-emerald/30 bg-govtech-emerald-dim text-govtech-emerald"
              }`}
            >
              {isDemoData ? "BCCL demo data" : "Live processed data"}
            </span>
          </div>
          <h1 className="mt-space-sm font-headline-lg text-headline-lg font-bold tracking-tight text-text-primary">
            {metadata.title}
          </h1>
          <p className="mt-space-xs font-body-md text-body-md text-text-secondary">
            {metadata.period} · {metadata.region}
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-space-xs rounded-lg bg-surface-card px-space-lg py-2 font-body-sm font-semibold text-text-primary shadow-sm transition-colors hover:bg-surface-hover"
          onClick={() => window.print()}
          type="button"
        >
          <span className="material-symbols-outlined text-[18px]">print</span>
          Print / Save as PDF
        </button>
      </div>

      {showDemoBanner && (
        <div className="mb-space-xl flex items-start gap-space-sm rounded-lg border border-state-warning/30 bg-state-warning/10 p-space-base text-state-warning">
          <span className="material-symbols-outlined text-[20px]">info</span>
          <p className="font-body-sm text-body-sm">{bannerText}</p>
        </div>
      )}

      <article className="rounded-xl bg-surface-card p-space-base shadow-xl sm:p-space-2xl">
        <header className="border-b border-border-subtle pb-space-lg">
          <div className="grid gap-space-base sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="font-mono-label text-mono-label uppercase text-text-muted">Subsidiary</p>
              <p className="mt-1 font-body-md font-semibold text-text-primary">{metadata.subsidiary}</p>
            </div>
            <div>
              <p className="font-mono-label text-mono-label uppercase text-text-muted">Report ID</p>
              <p className="mt-1 font-mono-citation text-mono-citation text-text-primary">{metadata.reportId}</p>
            </div>
            <div>
              <p className="font-mono-label text-mono-label uppercase text-text-muted">Prepared by</p>
              <p className="mt-1 font-body-md text-body-md text-text-primary">{metadata.preparedBy}</p>
            </div>
            <div>
              <p className="font-mono-label text-mono-label uppercase text-text-muted">Classification</p>
              <p className="mt-1 font-body-md text-body-md text-text-primary">{metadata.classification}</p>
            </div>
          </div>
        </header>

        <section className="mt-space-xl">
          <h2 className="font-headline-md text-headline-md font-bold text-text-primary">Key metrics</h2>
          <div className="mt-space-md grid gap-space-sm sm:grid-cols-2 xl:grid-cols-4">
            {kpiCards.map((card) => (
              <div className="rounded-lg bg-surface-base p-space-base" key={card.label}>
                <p className="font-mono-label text-mono-label uppercase text-text-muted">{card.label}</p>
                <p className={`mt-space-xs font-mono-metric-lg text-mono-metric-lg ${card.tone}`}>{card.value}</p>
                <p className="mt-space-xs font-mono-citation text-mono-citation text-text-secondary">{card.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-space-2xl">
          <div className="flex flex-col gap-space-xs sm:flex-row sm:items-end sm:justify-between">
            <h2 className="font-headline-md text-headline-md font-bold text-text-primary">Pit production</h2>
            <p className="font-mono-citation text-mono-citation text-text-muted">Million tonnes (MT)</p>
          </div>
          <div className="mt-space-md overflow-x-auto rounded-lg border border-border-subtle">
            <table className="w-full min-w-[560px] text-left">
              <thead className="bg-surface-base font-mono-label text-mono-label uppercase text-text-muted">
                <tr>
                  <th className="px-space-base py-space-sm">Pit</th>
                  <th className="px-space-base py-space-sm text-right">Target</th>
                  <th className="px-space-base py-space-sm text-right">Actual</th>
                  <th className="px-space-base py-space-sm text-right">Achievement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {productionByPit.map((production) => {
                  const achievement = (production.actualMT / production.targetMT) * 100;
                  return (
                    <tr className="font-body-sm text-body-sm text-text-primary" key={production.pit}>
                      <td className="px-space-base py-space-sm font-semibold">{production.pit}</td>
                      <td className="px-space-base py-space-sm text-right">{displayNumber(production.targetMT)}</td>
                      <td className="px-space-base py-space-sm text-right">{displayNumber(production.actualMT)}</td>
                      <td className="px-space-base py-space-sm text-right font-mono-citation text-mono-citation">
                        {displayNumber(achievement)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-space-2xl">
          <h2 className="font-headline-md text-headline-md font-bold text-text-primary">Executive report</h2>
          <div className="mt-space-md space-y-space-lg">
            {executiveReport.sections.map((section) => (
              <section className="border-l-2 border-mining-gold-bright pl-space-base" key={section.title}>
                <h3 className="font-body-md text-body-md font-bold text-text-primary">{section.title}</h3>
                <p className="mt-space-xs font-body-md text-body-md leading-relaxed text-text-secondary">{section.content}</p>
              </section>
            ))}
          </div>
        </section>

        <section className="mt-space-2xl grid gap-space-xl lg:grid-cols-2">
          <div>
            <h2 className="font-headline-md text-headline-md font-bold text-text-primary">Report topics</h2>
            <div className="mt-space-md space-y-space-xs">
              {topics.map((topic) => (
                <div className="flex flex-col gap-space-xs rounded-lg bg-surface-base p-space-sm sm:flex-row sm:items-center sm:justify-between" key={topic.name}>
                  <span className="font-body-sm font-semibold text-text-primary">{topic.name}</span>
                  <span className={`w-fit rounded border px-space-sm py-0.5 font-mono-citation text-mono-citation ${topicColors(topic.sentiment)}`}>
                    {topic.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="font-headline-md text-headline-md font-bold text-text-primary">Report keywords</h2>
            <div className="mt-space-md flex flex-wrap gap-space-xs rounded-lg bg-surface-base p-space-base">
              {wordcloud.map((term) => (
                <span className="rounded-full bg-surface-card px-space-sm py-1 font-body-sm text-body-sm text-text-secondary" key={term.value}>
                  {term.value} ({term.count})
                </span>
              ))}
            </div>
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
  // Keep the page subscribed to the authenticated session while ProtectedPage
  // handles the redirect and access gate.
  const { token } = useAuth();
  const router = useRouter();

  // `undefined` = not checked yet, `null` = checked and no such local folder
  // — same pattern as the workspace page at [folderId]/page.tsx.
  const [folder, setFolder] = useState<Folder | null | undefined>(undefined);

  const [allDocuments, setAllDocuments] = useState<DocumentListItem[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [phase, setPhase] = useState<GeneratePhase>("idle");
  const [report, setReport] = useState<ReportData | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    const found = getFolder(folderId) ?? null;
    setFolder(found);
    if (!found) {
      router.replace("/dashboard");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId]);

  const loadDocuments = useCallback(async () => {
    setDocumentsLoading(true);
    setDocumentsError(null);

    try {
      const response = await getDocuments(token ?? undefined);
      setAllDocuments(response.documents);
    } catch (error) {
      setDocumentsError(getErrorMessage(error, "Your document library could not be loaded."));
    } finally {
      setDocumentsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  // Pre-scope the selection source to this folder's documentIds, instead of
  // showing every document the user has ever uploaded. Folder documentIds are
  // ML document ids (see DocumentListItem.mlDocumentId), not Mongo _ids.
  const folderDocumentIds = folder?.documentIds ?? [];
  const documents = useMemo(
    () => allDocuments.filter((doc) => doc.mlDocumentId && folderDocumentIds.includes(doc.mlDocumentId)),
    [allDocuments, folderDocumentIds],
  );

  const toggleDocument = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]));
  };

  const handleGenerate = useCallback(async () => {
    if (!token) {
      setGenerateError("Your session is unavailable. Please sign in again.");
      setPhase("error");
      return;
    }

    setPhase("loading");
    setGenerateError(null);
    setFallbackNotice(null);

    try {
      // This backend endpoint doesn't exist yet (see REDESIGN_PLAN.md section
      // 3) — it's expected to 404/fail until a teammate ships it.
      const generated = await generateReport(selectedIds, startDate || undefined, endDate || undefined, token);
      setReport(generated);
      setPhase("ready");
    } catch (error) {
      try {
        const demoReport = await getMockReport(token);
        setReport(demoReport);
        setFallbackNotice(
          "Report generation isn't live on the backend yet. Showing the canonical BCCL demonstration report instead.",
        );
        setPhase("ready");
      } catch (fallbackErr) {
        setGenerateError(
          getErrorMessage(fallbackErr, "The decision brief could not be generated. Please try again."),
        );
        setPhase("error");
      }
    }
  }, [token, selectedIds, startDate, endDate]);

  if (folder === undefined) {
    return <LoadingPanel>Opening folder…</LoadingPanel>;
  }

  // folder === null is handled by the redirect effect above; render nothing
  // while that navigation takes effect.
  if (!folder) {
    return null;
  }

  const folderIsEmpty = folderDocumentIds.length === 0;

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
          Reports &amp; Decision Briefs
        </h1>
        <p className="mt-space-xs font-body-md text-body-md text-text-secondary">
          Choose from {folder.name}&apos;s source documents and a reporting period, then generate a decision brief.
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
            Add at least one document to &quot;{folder.name}&quot; before generating a decision brief.
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
            documentsLoading={documentsLoading}
            documentsError={documentsError}
            onRetryDocuments={() => void loadDocuments()}
            selectedIds={selectedIds}
            onToggleDocument={toggleDocument}
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onGenerate={() => void handleGenerate()}
            isGenerating={phase === "loading"}
          />

          {phase === "loading" && (
            <div className="mt-space-xl flex flex-col items-center justify-center gap-space-sm rounded-xl border border-border-crisp bg-surface-card p-space-2xl text-center">
              <span className="material-symbols-outlined animate-spin text-[32px] text-mining-gold-bright">
                progress_activity
              </span>
              <h2 className="font-headline-md text-headline-md font-bold text-text-primary">Generating decision brief</h2>
              <p className="font-body-sm text-body-sm text-text-secondary">
                Building your report from the selected documents.
              </p>
            </div>
          )}

          {phase === "error" && (
            <section className="mt-space-xl rounded-xl border border-state-critical/30 bg-surface-card p-space-xl text-center shadow-lg">
              <span className="material-symbols-outlined text-[36px] text-state-critical">error</span>
              <h2 className="mt-space-sm font-headline-md text-headline-md font-bold text-text-primary">
                Decision Brief unavailable
              </h2>
              <p className="mx-auto mt-space-sm max-w-xl font-body-sm text-body-sm text-text-secondary">
                {generateError ?? "The report service did not return a decision brief."}
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

          {phase === "ready" && report && <ReportDisplay report={report} fallbackNotice={fallbackNotice} />}
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
