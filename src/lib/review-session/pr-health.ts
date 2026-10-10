import type { PrReviewStatus } from "@/lib/review-session/types";
import type { PullRequest } from "@/lib/types";

export function hasReviewSession(
  pr: Pick<PullRequest, "sessions">,
): boolean {
  return pr.sessions.review;
}

export function isStaleReview(
  pr: Pick<PullRequest, "sessions" | "reviewStatus">,
): boolean {
  return pr.sessions.review && pr.reviewStatus.stale === true;
}

export function isNotCleanReview(
  pr: Pick<PullRequest, "sessions" | "reviewStatus">,
): boolean {
  return pr.sessions.review && pr.reviewStatus.clean === false;
}

/** Tooltip when Clean is No or unknown; null when clean or no review session. */
export function cleanTooltip(
  status: Pick<
    PrReviewStatus,
    "clean" | "cleanExplicit" | "openFindings" | "openFindingReasons"
  >,
): string | null {
  if (status.clean === true) return null;

  if (status.clean === false) {
    if (status.openFindingReasons.length > 0) {
      return status.openFindingReasons.join(" · ");
    }
    if (status.openFindings > 0) {
      const n = status.openFindings;
      return `${n} open finding${n === 1 ? "" : "s"} in latest review session`;
    }
    if (status.cleanExplicit) {
      return "Marked not clean in session frontmatter or footer";
    }
    return "Open findings in latest review session";
  }

  return "Could not determine clean status from session";
}

export function reviewSessionTriState(
  pr: Pick<PullRequest, "sessions" | "reviewStatus">,
  field: "clean" | "stale",
): boolean | null {
  if (!pr.sessions.review) return null;
  return pr.reviewStatus[field];
}

export function triStateSortRank(
  pr: Pick<PullRequest, "sessions" | "reviewStatus">,
  field: "clean" | "stale",
): number {
  if (!pr.sessions.review) return -1;
  const value = pr.reviewStatus[field];
  if (value === true) return 2;
  if (value === false) return 1;
  return 0;
}
