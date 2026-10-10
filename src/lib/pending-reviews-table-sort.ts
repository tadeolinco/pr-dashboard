import { combinedDiffLines } from "@/lib/pending-reviews/combined-diff";
import type { PendingReviewsReviewer } from "@/lib/pending-reviews/types";
import type { SortDirection } from "@/lib/pr-table-sort";

export type PendingReviewsSortKey =
  | "login"
  | "count"
  | "additions"
  | "deletions"
  | "total_diff_lines"
  | "changed_files"
  | "recent_review_count"
  | "recent_review_diff_lines"
  | "combined_diff_lines";

export type PendingReviewsSortState = {
  key: PendingReviewsSortKey;
  direction: SortDirection;
};

export const DEFAULT_PENDING_REVIEWS_SORT: PendingReviewsSortState = {
  key: "combined_diff_lines",
  direction: "desc",
};

export function defaultPendingReviewsSortDirection(
  key: PendingReviewsSortKey,
): SortDirection {
  return key === "login" ? "asc" : "desc";
}

export function sortPendingReviewers(
  reviewers: PendingReviewsReviewer[],
  sort: PendingReviewsSortState,
): PendingReviewsReviewer[] {
  return [...reviewers].sort((a, b) => {
    const cmp = compareValues(
      sortValue(a, sort.key),
      sortValue(b, sort.key),
      sort.direction,
    );
    if (cmp !== 0) return cmp;
    return a.login.localeCompare(b.login, undefined, { sensitivity: "base" });
  });
}

function sortValue(
  row: PendingReviewsReviewer,
  key: PendingReviewsSortKey,
): string | number {
  switch (key) {
    case "login":
      return row.login.toLowerCase();
    case "count":
      return row.count;
    case "additions":
      return row.total_additions;
    case "deletions":
      return row.total_deletions;
    case "total_diff_lines":
      return row.total_diff_lines;
    case "changed_files":
      return row.total_changed_files;
    case "recent_review_count":
      return row.recent_review_count ?? 0;
    case "recent_review_diff_lines":
      return row.recent_review_diff_lines ?? 0;
    case "combined_diff_lines":
      return row.combined_diff_lines ?? combinedDiffLines(row);
  }
}

function compareValues(
  a: string | number,
  b: string | number,
  direction: SortDirection,
) {
  let cmp = 0;
  if (typeof a === "number" && typeof b === "number") {
    cmp = a - b;
  } else {
    cmp = String(a).localeCompare(String(b), undefined, { numeric: true });
  }
  return direction === "asc" ? cmp : -cmp;
}
