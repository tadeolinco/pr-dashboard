import { loadAppConfig } from "@/lib/config";
import {
    isPendingReviewsCacheFresh,
    readPendingReviewsCache,
    writePendingReviewsCache,
    type PendingReviewsTarget,
} from "@/lib/pending-reviews/cache";
import { fetchPendingReviewsReport } from "@/lib/pending-reviews/fetch";
import type { PendingReviewsReport } from "@/lib/pending-reviews/types";

export type PendingReviewsPayload = {
  report: PendingReviewsReport | null;
  fresh: boolean;
  error?: string;
};

export function loadPendingReviews(
  target: PendingReviewsTarget,
): PendingReviewsPayload {
  const report = readPendingReviewsCache(target);
  if (!report) {
    return { report: null, fresh: false };
  }
  return { report, fresh: isPendingReviewsCacheFresh(report) };
}

export async function refreshPendingReviews(
  target: PendingReviewsTarget,
): Promise<PendingReviewsPayload> {
  const { githubToken } = await loadAppConfig();
  if (!githubToken) {
    return {
      report: null,
      fresh: false,
      error: "GitHub token is not set",
    };
  }

  try {
    const report = await fetchPendingReviewsReport(githubToken, target.org, {
      repos: target.repos,
    });
    writePendingReviewsCache(target, report);
    return { report, fresh: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refresh failed";
    const cached = readPendingReviewsCache(target);
    return {
      report: cached,
      fresh: cached ? isPendingReviewsCacheFresh(cached) : false,
      error: message,
    };
  }
}
