"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { ProtectedPage } from "@/components/ProtectedPage";
import { ApiError, createFolder, deleteFolder, getFolders } from "@/lib/api";
import type { FolderSummary } from "@/lib/report-types";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

/** Shared dashed-border empty state, reused from the previous document-grid
 * version of this page. */
function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  actionIcon = "add_circle",
}: {
  icon: string;
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
  actionIcon?: string;
}) {
  return (
    <div className="flex min-h-[440px] flex-col items-center justify-center rounded-xl border border-dashed border-border-crisp bg-surface-card/40 p-space-xl text-center">
      <span className="material-symbols-outlined mb-space-sm text-[34px] text-mining-gold-bright">
        {icon}
      </span>
      <h1 className="font-headline-lg text-headline-lg font-bold text-text-primary">{title}</h1>
      <p className="mt-space-sm max-w-lg text-body-md text-text-secondary">{message}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-space-lg inline-flex items-center gap-2 rounded-lg bg-primary-container px-space-lg py-2.5 font-body-md font-bold text-surface-base transition-colors hover:bg-mining-gold-deep"
      >
        <span className="material-symbols-outlined text-[18px]">{actionIcon}</span>
        {actionLabel}
      </button>
    </div>
  );
}

function formatCreatedDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown date";
  return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** Inline "+ Create folder" tile: a small form matching the existing
 * input/border/focus patterns used on the login page, rather than a native
 * window.prompt(). */
function CreateFolderTile({
  onCreate,
  isCreating,
  setIsCreating,
  isSubmitting,
}: {
  onCreate: (name: string) => void;
  isCreating: boolean;
  setIsCreating: (value: boolean) => void;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setName("");
  };

  if (isCreating) {
    return (
      <form
        onSubmit={handleSubmit}
        className="flex min-h-[180px] flex-col justify-between gap-space-sm rounded-xl border-2 border-dashed border-mining-gold-bright bg-surface-card/40 p-space-lg text-left"
      >
        <label className="flex flex-col gap-1.5 font-body-sm text-text-secondary">
          Folder name
          <input
            autoFocus
            className="rounded-lg border border-border-crisp bg-surface-base px-3 py-2 text-text-primary outline-none focus:border-mining-gold-bright"
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. BCCL Jharia Basin"
            value={name}
            disabled={isSubmitting}
          />
        </label>
        <div className="flex gap-space-xs">
          <button
            type="submit"
            disabled={!name.trim() || isSubmitting}
            className="flex-1 rounded-lg bg-primary-container px-space-base py-2 font-body-sm font-bold text-surface-base transition-colors hover:bg-mining-gold-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Creating…" : "Create"}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsCreating(false);
              setName("");
            }}
            disabled={isSubmitting}
            className="rounded-lg border border-border-crisp px-space-base py-2 font-body-sm text-text-secondary transition-colors hover:border-mining-gold-bright hover:text-text-primary disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsCreating(true)}
      className="flex min-h-[180px] flex-col items-center justify-center gap-space-xs rounded-xl border-2 border-dashed border-border-crisp bg-surface-card/40 p-space-lg text-center transition-colors hover:border-mining-gold-bright"
    >
      <span className="material-symbols-outlined text-[30px] text-mining-gold-bright">add_circle</span>
      <span className="text-body-sm font-semibold text-text-primary">Create folder</span>
      <span className="font-mono-citation text-mono-citation text-text-muted">
        Group sources into a notebook
      </span>
    </button>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { token } = useAuth();
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadFolders = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await getFolders(token ?? undefined);
      setFolders(response.folders);
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  const handleCreate = async (name: string) => {
    setIsSubmitting(true);
    try {
      await createFolder(name, token ?? undefined);
      setIsCreating(false);
      await loadFolders();
    } catch (error) {
      window.alert(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (folder: FolderSummary) => {
    const confirmed = window.confirm(
      `Delete folder "${folder.name}"? This only removes the folder grouping — its source documents remain in your library.`,
    );
    if (!confirmed) return;
    try {
      await deleteFolder(folder._id, token ?? undefined);
      await loadFolders();
    } catch (error) {
      window.alert(getErrorMessage(error));
    }
  };

  return (
    <ProtectedPage>
      <div className="mx-auto w-full max-w-[1680px] px-space-base py-space-xl sm:px-space-xl">
        <header className="mb-space-lg">
          <h1 className="font-headline-lg text-headline-lg font-bold text-text-primary">
            Workspace Folders
          </h1>
          <p className="mt-space-xs text-body-md text-text-secondary">
            Group your uploaded sources into folders, then chat across every document in a folder.
          </p>
        </header>

        {isLoading ? (
          <div className="flex min-h-[440px] flex-col items-center justify-center gap-space-sm text-text-secondary">
            <span className="material-symbols-outlined animate-spin text-[32px] text-mining-gold-bright">
              progress_activity
            </span>
            <p className="font-body-md">Loading your folders…</p>
          </div>
        ) : loadError ? (
          <EmptyState
            icon="cloud_off"
            title="Couldn't load your folders"
            message={loadError}
            actionLabel="Retry"
            actionIcon="refresh"
            onAction={() => void loadFolders()}
          />
        ) : folders.length === 0 && !isCreating ? (
          <EmptyState
            icon="folder_open"
            title="No folders yet"
            message="Create your first folder to group geological reports, drill logs, or compliance PDFs, then chat across every source inside it."
            actionLabel="Create folder"
            onAction={() => setIsCreating(true)}
          />
        ) : (
          <div className="grid grid-cols-1 gap-space-lg sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <CreateFolderTile
              onCreate={(name) => void handleCreate(name)}
              isCreating={isCreating}
              setIsCreating={setIsCreating}
              isSubmitting={isSubmitting}
            />

            {folders.map((folder) => (
              <div
                key={folder._id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/dashboard/${folder._id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    router.push(`/dashboard/${folder._id}`);
                  }
                }}
                className="flex min-h-[180px] cursor-pointer flex-col justify-between rounded-xl border border-border-crisp bg-surface-card p-space-lg text-left shadow-sm transition-colors hover:border-mining-gold-bright"
              >
                <div>
                  <div className="flex items-start justify-between gap-space-sm">
                    <span className="material-symbols-outlined text-[26px] text-mining-gold-bright">
                      folder
                    </span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDelete(folder);
                      }}
                      title="Delete folder"
                      className="shrink-0 text-text-muted transition-colors hover:text-state-critical"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                  <p className="mt-space-sm truncate font-body-md font-semibold text-text-primary">
                    {folder.name}
                  </p>
                  <p className="mt-1 font-mono-citation text-mono-citation text-text-muted">
                    Created {formatCreatedDate(folder.createdAt)}
                  </p>
                </div>
                <span className="mt-space-sm inline-flex w-fit items-center gap-1.5 rounded-full border border-mining-gold-bright/40 bg-mining-gold-bright/10 px-2.5 py-0.5 font-mono-citation text-mono-citation font-semibold text-mining-gold-bright">
                  {folder.documentIds.length} source{folder.documentIds.length === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </ProtectedPage>
  );
}
