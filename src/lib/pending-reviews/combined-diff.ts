import type { PendingReviewsReviewer } from "@/lib/pending-reviews/types";

/** Pending queue diff + 7d reviewed diff, each PR counted once (fairness sort key). */
export function combinedDiffLines(
  row: Pick<PendingReviewsReviewer, "total_diff_lines" | "recent_review_diff_lines">,
): number {
  return row.total_diff_lines + (row.recent_review_diff_lines ?? 0);
}

export function withCombinedDiffLines(
  row: PendingReviewsReviewer,
): PendingReviewsReviewer {
  return { ...row, combined_diff_lines: combinedDiffLines(row) };
}
