import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatNumber(value: number, maxDecimals = 2): string {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: maxDecimals,
  }).format(value);
}

export function topicStyle(sentiment: string): string {
  switch (sentiment) {
    case "positive":
      return "bg-govtech-emerald-dim text-govtech-emerald border border-govtech-emerald/30";
    case "warning":
      return "bg-state-warning/20 text-state-warning border border-state-warning/30";
    case "critical":
      return "bg-state-critical/20 text-state-critical border border-state-critical/30";
    default:
      return "bg-surface-hover text-text-secondary border border-border-crisp";
  }
}
