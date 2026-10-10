export type PendingReviewsStackParent = {
  number: number;
  title: string;
  url: string;
};

/** Formal review submission in the rolling recent window (see recent-review-load). */
export type PendingReviewsRecentReview = {
  repo: string;
  repo_full: string;
  number: number;
  title: string;
  url: string;
  additions: number;
  deletions: number;
  diff_lines: number;
  changed_files: number;
  /** ISO 8601 */
  submitted_at: string;
  state: string;
  author_login?: string;
  author_avatar_url?: string | null;
};

export type PendingReviewsPr = {
  repo: string;
  repo_full: string;
  number: number;
  title: string;
  url: string;
  additions: number;
  deletions: number;
  diff_lines: number;
  changed_files: number;
  base_ref: string;
  head_ref: string;
  stack_parent: PendingReviewsStackParent | null;
  /** Omitted in older cached scans. */
  author_login?: string;
  author_avatar_url?: string | null;
  /** ISO 8601; newest commit on the PR head. Omitted in older cached scans. */
  lastCommitAt?: string;
  /** ISO 8601; most recent human review submission. Omitted in older cached scans. */
  lastHumanReviewAt?: string;
};

export type PendingReviewsReviewer = {
  login: string;
  /** Omitted in older cached scans. */
  avatar_url?: string | null;
  count: number;
  total_additions: number;
  total_deletions: number;
  total_diff_lines: number;
  total_changed_files: number;
  prs: PendingReviewsPr[];
  /** Omitted in older cached scans. */
  recent_review_count?: number;
  recent_review_additions?: number;
  recent_review_deletions?: number;
  recent_review_diff_lines?: number;
  recent_review_changed_files?: number;
  recent_reviews?: PendingReviewsRecentReview[];
  /** pending total_diff_lines + recent_review_diff_lines. Omitted in older cached scans. */
  combined_diff_lines?: number;
};

export type PendingReviewsReport = {
  org: string;
  /** Older cached scans only; target branches are now per repo. */
  base_branch?: string;
  generated_at_utc: string;
  reviewers: PendingReviewsReviewer[];
  summary: {
    reviewer_rows_with_pending: number;
    sum_of_pending_rows: number;
    sum_of_diff_lines: number;
    unique_prs: number;
    /** Omitted in older cached scans. */
    sum_of_recent_review_diff_lines?: number;
  };
};
