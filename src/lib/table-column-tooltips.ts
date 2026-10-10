/** Hover text for My PRs table column headers. */
export const MY_PRS_COLUMN_TOOLTIPS = {
  repo: "Repository badge; set aliases in Settings → Repo settings",
  number: "Pull request number on GitHub",
  title: "Pull request title",
  status:
    "Derived review state from GitHub; bot reviews are ignored when deciding if a human reviewer is still needed",
  reviewers:
    "Open review requests, reviewers who requested changes, and requested teams",
  checks: "CI check rollup for the head commit",
  behind:
    "Yes when the head branch is missing commits from the PR base (out of date); Conflict when merge is blocked",
  inDev:
    "Whether the latest commit on the PR branch is already on the repo's integration branch (development unless set in Settings → Repo settings)",
  review:
    "Latest review session round from your local docs folder; hover a cell for the session file path",
  clean:
    "Whether the latest session has no open findings (session frontmatter and findings)",
  stale:
    "Yes when GitHub’s head SHA differs from the session’s reviewed SHA, or the session was marked dirty",
  triage: "Whether your local docs folder has a triage session for this PR",
  total: "Lines changed: additions plus deletions",
  createdAt: "When the pull request was opened",
  updatedAt: "When the pull request was last updated on GitHub",
} as const;

/** Hover text for Pending reviews table column headers. */
export const PENDING_REVIEWS_COLUMN_TOOLTIPS = {
  login: "GitHub login with an outstanding review request",
  count: "Open PRs on the repo's target branch (its GitHub default unless set in Repo settings), or stacked onto it, awaiting this reviewer",
  additions: "Sum of added lines across pending PRs",
  deletions: "Sum of removed lines across pending PRs",
  total_diff_lines: "Pending additions plus deletions (Σ diff)",
  changed_files: "Sum of changed files across pending PRs",
  recent_review_count:
    "Distinct PRs you reviewed in the last 7 days (once per PR, not your own; excludes PRs still awaiting your review)",
  recent_review_diff_lines:
    "Sum of diff size, once per reviewed PR (7-day window; excludes own PRs and re-requested pending PRs)",
  combined_diff_lines:
    "Pending Σ diff plus 7d reviewed Σ diff (each PR counted at most once)",
} as const;
