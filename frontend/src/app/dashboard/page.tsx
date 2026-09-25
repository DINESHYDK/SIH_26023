"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useState,
} from "react";
import { useAuth } from "@/components/AuthProvider";
import { ProtectedPage } from "@/components/ProtectedPage";
import { MetricCard } from "@/components/ui/MetricCard";
import { DataModeBadge } from "@/components/ui/DataModeBadge";
import { DocumentUploadDock } from "@/components/dashboard/DocumentUploadDock";
import { PitProductionBars } from "@/components/dashboard/PitProductionBars";
import { TopicsWordCloud } from "@/components/dashboard/TopicsWordCloud";
import { GroundedChatDock } from "@/components/dashboard/GroundedChatDock";
import { ApiError, getMockReport, submitQuery, uploadDocument } from "@/lib/api";
import type {
  DocumentRecord,
  QueryResponse,
  ReportData,
} from "@/lib/report-types";

const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ["pdf", "xlsx", "csv", "tif", "tiff"];

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

function EmptyState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-[440px] flex-col items-center justify-center rounded-xl border border-dashed border-border-crisp bg-surface-card/40 p-space-xl text-center">
      <span className="material-symbols-outlined mb-space-sm text-[34px] text-mining-gold-bright">
        cloud_off
      </span>
      <h1 className="font-headline-lg text-headline-lg font-bold text-text-primary">
        Mine Workspace is Unavailable
      </h1>
      <p className="mt-space-sm max-w-lg text-body-md text-text-secondary">
        We could not load the BCCL Jharia report from the gateway service. Check that the backend is running, then try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-space-lg inline-flex items-center gap-2 rounded-lg bg-primary-container px-space-lg py-2.5 font-body-md font-bold text-surface-base transition-colors hover:bg-mining-gold-deep"
      >
        <span className="material-symbols-outlined text-[18px]">refresh</span>
        Retry report load
      </button>
    </div>
  );
}

export default function DashboardPage() {
  const { user, token } = useAuth();
  const [report, setReport] = useState<ReportData | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [queryResponse, setQueryResponse] = useState<QueryResponse | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);

  const loadReport = async () => {
    setIsLoadingReport(true);
    setReportError(null);

    try {
      setReport(await getMockReport(token ?? undefined));
    } catch (error) {
      setReportError(getErrorMessage(error));
    } finally {
      setIsLoadingReport(false);
    }
  };

  useEffect(() => {
    void loadReport();
  }, []);

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setUploadError(null);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !ACCEPTED_EXTENSIONS.includes(extension)) {
      setSelectedFile(null);
      setUploadError("Select a valid geological PDF, XLSX, CSV, TIF, or TIFF file.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      setSelectedFile(null);
      setUploadError("Files must be 50 MB or smaller.");
      event.target.value = "";
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadError("Choose a supported file before uploading.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const response = await uploadDocument(selectedFile, token ?? undefined);
      setDocument(response.document);
      setReport(response.report);
      setQueryResponse(null);
      setSelectedFile(null);
    } catch (error) {
      setUploadError(getErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  };

  const handleQuery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery || !report) return;

    setIsQuerying(true);
    setQueryError(null);

    try {
      const response = await submitQuery(
        trimmedQuery,
        document?.id ?? report.metadata.reportId,
        token ?? undefined
      );
      setQueryResponse(response);
      setQuery("");
    } catch (error) {
      setQueryError(getErrorMessage(error));
    } finally {
      setIsQuerying(false);
    }
  };

  return (
    <ProtectedPage>
      <div className="w-full px-space-base py-space-xl sm:px-space-xl">
        {isLoadingReport ? (
          <div className="flex min-h-[440px] flex-col items-center justify-center gap-space-sm text-text-secondary">
            <span className="material-symbols-outlined animate-spin text-[32px] text-mining-gold-bright">
              progress_activity
            </span>
            <p className="font-body-md">Loading BCCL Jharia workspace telemetry…</p>
          </div>
        ) : reportError || !report ? (
          <EmptyState onRetry={() => void loadReport()} />
        ) : (
          <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-space-lg">
            {/* Header Status Bar */}
            <section className="flex flex-col justify-between gap-space-base rounded-xl border border-border-crisp bg-surface-card p-space-lg lg:flex-row lg:items-center shadow-sm">
              <div>
                <div className="flex flex-wrap items-center gap-space-sm">
                  <span className="material-symbols-outlined text-[27px] text-mining-gold-bright">
                    landscape
                  </span>
                  <h1 className="font-headline-lg text-headline-lg font-bold text-text-primary">
                    BCCL Jharia Workspace
                  </h1>
                  <DataModeBadge dataMode={report.dataMode} />
                </div>
                <p className="mt-space-xs text-body-md text-text-secondary">
                  Active Operational Dossier · {report.metadata.period}
                </p>
                <p className="mt-0.5 font-mono-citation text-mono-citation text-text-muted">
                  {report.metadata.title} · {report.metadata.region}
                </p>
              </div>
              <div className="rounded-lg border border-border-crisp bg-surface-dim px-space-md py-space-sm text-right">
                <p className="font-mono-label text-mono-label uppercase tracking-wider text-text-muted">
                  Surveyor Session
                </p>
                <p className="text-body-sm font-semibold text-text-primary">
                  {user?.name ?? user?.email ?? "Surveyor Officer"}
                </p>
              </div>
            </section>

            {/* Split Workspace Layout */}
            <div className="grid grid-cols-1 gap-space-lg xl:grid-cols-[minmax(280px,0.32fr)_minmax(0,0.68fr)]">
              {/* Left: Document Upload Dock */}
              <DocumentUploadDock
                selectedFile={selectedFile}
                onFileSelect={handleFileSelection}
                onUpload={() => void handleUpload()}
                isUploading={isUploading}
                uploadError={uploadError}
                document={document}
              />

              {/* Right: Telemetry & Analytics Hub */}
              <main className="flex min-w-0 flex-col gap-space-lg">
                {/* 4 KPI Cards */}
                <section className="grid grid-cols-1 gap-space-base sm:grid-cols-2 2xl:grid-cols-4">
                  <MetricCard
                    label="Coal Production"
                    value={`${report.kpis.coalProductionMT} MT`}
                    detail={`Target ${report.kpis.coalProductionTargetMT} MT`}
                    icon="factory"
                    trend="+6.2% YoY"
                    trendPositive
                  />
                  <MetricCard
                    label="Overburden Removed (OBR)"
                    value={`${report.kpis.overburdenRemovalMCuM} M.Cu.M`}
                    detail={`Target 30.50 M.Cu.M`}
                    icon="landslide"
                    trend="Pacing"
                    trendPositive
                  />
                  <MetricCard
                    label="Stripping Ratio"
                    value={report.kpis.strippingRatio.toFixed(2)}
                    detail={`Normative ${report.kpis.strippingRatioTarget.toFixed(2)}`}
                    icon="balance"
                    trend="+0.06 Variance"
                  />
                  <MetricCard
                    label="Inferred Coking Reserves"
                    value={`${report.kpis.inferredReservesMT} MT`}
                    detail={report.kpis.activeSeams.join(", ")}
                    icon="layers"
                    trend="High Confidence"
                    trendPositive
                  />
                </section>

                {/* Pit-Wise Production Comparison Bars */}
                <PitProductionBars
                  productionByPit={report.productionByPit}
                  period={report.metadata.period}
                />

                {/* Topics & Word Cloud Grid */}
                <TopicsWordCloud
                  wordcloud={report.wordcloud}
                  topics={report.topics}
                  executiveSections={report.executiveReport.sections}
                />

                {/* Source-Grounded Q&A Dock */}
                <GroundedChatDock
                  query={query}
                  onQueryChange={setQuery}
                  onSubmit={handleQuery}
                  isQuerying={isQuerying}
                  queryResponse={queryResponse}
                  queryError={queryError}
                  dataMode={queryResponse?.dataMode ?? report.dataMode}
                />
              </main>
            </div>
          </div>
        )}
      </div>
    </ProtectedPage>
  );
}
