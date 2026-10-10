import { withCombinedDiffLines } from "@/lib/pending-reviews/combined-diff";
import type {
    PendingReviewsPr,
    PendingReviewsReviewer,
} from "@/lib/pending-reviews/types";

/** PRs with no commits or human reviews in this window are hidden unless “show all” is on. */
export const PENDING_PR_INACTIVE_MS = 30 * 24 * 60 * 60 * 1000;

export function pendingPrLastMeaningfulActivityMs(
  pr: Pick<PendingReviewsPr, "lastCommitAt" | "lastHumanReviewAt">,
): number | null {
  let latest: number | null = null;
  for (const iso of [pr.lastCommitAt, pr.lastHumanReviewAt]) {
    if (!iso) continue;
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) continue;
    if (latest === null || ms > latest) latest = ms;
  }
  return latest;
}

export function pendingPrHasRecentActivity(
  pr: Pick<PendingReviewsPr, "lastCommitAt" | "lastHumanReviewAt">,
  nowMs = Date.now(),
): boolean {
  const lastMs = pendingPrLastMeaningfulActivityMs(pr);
  if (lastMs === null) return true;
  return nowMs - lastMs <= PENDING_PR_INACTIVE_MS;
}

function reviewerFromPrs(
  row: PendingReviewsReviewer,
  prs: PendingReviewsPr[],
): PendingReviewsReviewer {
  const sorted = [...prs].sort((a, b) => b.diff_lines - a.diff_lines);
  const total_additions = sorted.reduce((sum, p) => sum + p.additions, 0);
  const total_deletions = sorted.reduce((sum, p) => sum + p.deletions, 0);
  const base: PendingReviewsReviewer = {
    login: row.login,
    avatar_url: row.avatar_url,
    count: sorted.length,
    total_additions,
    total_deletions,
    total_diff_lines: total_additions + total_deletions,
    total_changed_files: sorted.reduce((sum, p) => sum + p.changed_files, 0),
    prs: sorted,
    recent_review_count: row.recent_review_count ?? 0,
    recent_review_additions: row.recent_review_additions ?? 0,
    recent_review_deletions: row.recent_review_deletions ?? 0,
    recent_review_diff_lines: row.recent_review_diff_lines ?? 0,
    recent_review_changed_files: row.recent_review_changed_files ?? 0,
    recent_reviews: row.recent_reviews ?? [],
  };
  return withCombinedDiffLines(base);
}

export function applyPendingReviewsActivityFilter(
  reviewers: PendingReviewsReviewer[],
  includeInactive: boolean,
  nowMs = Date.now(),
): { reviewers: PendingReviewsReviewer[]; hiddenPrCount: number } {
  if (includeInactive) {
    return {
      reviewers: reviewers.map(withCombinedDiffLines),
      hiddenPrCount: 0,
    };
  }

  let hiddenPrCount = 0;
  const filtered = reviewers.map((row) => {
    const prs = row.prs.filter((pr) => {
      const keep = pendingPrHasRecentActivity(pr, nowMs);
      if (!keep) hiddenPrCount += 1;
      return keep;
    });
    return reviewerFromPrs(row, prs);
  });

  return { reviewers: filtered, hiddenPrCount };
}

export function pendingReviewsSummaryFromReviewers(
  reviewers: PendingReviewsReviewer[],
) {
  const withPending = reviewers.filter((t) => t.count > 0);
  const seen = new Set<string>();
  for (const reviewer of withPending) {
    for (const pr of reviewer.prs) {
      seen.add(`${pr.repo_full}#${pr.number}`);
    }
  }
  return {
    reviewer_rows_with_pending: withPending.length,
    sum_of_pending_rows: withPending.reduce((sum, t) => sum + t.count, 0),
    sum_of_diff_lines: withPending.reduce((sum, t) => sum + t.total_diff_lines, 0),
    unique_prs: seen.size,
  };
}
