import type { PendingReviewsReport } from "@/lib/pending-reviews/types";

const STORAGE_PREFIX = "pr-dashboard.pending-reviews:";
export const PENDING_REVIEWS_MAX_AGE_MS = 30 * 60 * 1000;

/** One cached tally per org + repo selection. */
export type PendingReviewsTarget = { org: string; repos: string[] | null };

function storageKey({ org, repos }: PendingReviewsTarget) {
  return `${STORAGE_PREFIX}${org.toLowerCase()}:${repos?.join(",") ?? "*"}`;
}

export function readPendingReviewsCache(
  target: PendingReviewsTarget,
): PendingReviewsReport | null {
  try {
    const raw = localStorage.getItem(storageKey(target));
    return raw ? (JSON.parse(raw) as PendingReviewsReport) : null;
  } catch {
    return null;
  }
}

export function writePendingReviewsCache(
  target: PendingReviewsTarget,
  report: PendingReviewsReport,
) {
  try {
    localStorage.setItem(storageKey(target), JSON.stringify(report));
  } catch {
    // Storage full or blocked: the tally still shows, it just refetches next load.
  }
}

/** `generated_at_utc` is stored as "YYYY-MM-DD HH:MM:SS" in UTC. */
export function reportGeneratedAtMs(report: PendingReviewsReport): number {
  return Date.parse(`${report.generated_at_utc.replace(" ", "T")}Z`);
}

export function cacheAgeMs(report: PendingReviewsReport): number {
  const parsed = reportGeneratedAtMs(report);
  if (Number.isNaN(parsed)) return Number.POSITIVE_INFINITY;
  return Date.now() - parsed;
}

export function isPendingReviewsCacheFresh(report: PendingReviewsReport) {
  return cacheAgeMs(report) <= PENDING_REVIEWS_MAX_AGE_MS;
}
