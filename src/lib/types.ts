export type ReviewStatus =
  | "awaiting_reviewer"
  | "review_requested"
  | "commented"
  | "changes_requested"
  | "approved"
  /** Only on merged PRs pulled in to complete a linked group; never a filter. */
  | "merged";

export type CheckStatus = "SUCCESS" | "FAILURE" | "PENDING" | "ERROR" | "EXPECTED" | null;

/** Whether the PR head commit is reachable from the repo's development branch. */
export type DevelopmentSyncStatus =
  | "in_dev"
  | "not_in_dev"
  | "unavailable"
  | "unknown";

/** GitHub `PullRequest.mergeStateStatus` (base branch vs head). */
export type MergeStateStatus =
  | "BEHIND"
  | "BLOCKED"
  | "CLEAN"
  | "DIRTY"
  | "DRAFT"
  | "HAS_HOOKS"
  | "UNKNOWN"
  | "UNSTABLE";

export type Actor = {
  login: string;
  avatarUrl: string | null;
  isBot: boolean;
};

export type TeamReviewer = {
  name: string;
  slug: string;
};

import type { ReviewDecision } from "@/lib/pr-status";
import type { PrReviewStatus } from "@/lib/review-session/types";

export type PullRequest = {
  id: string;
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  /** Set only on merged PRs shown alongside their open linked PRs. */
  mergedAt: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  headRefName: string;
  headRefOid: string | null;
  baseRefName: string;
  mergeStateStatus: MergeStateStatus | null;
  checkStatus: CheckStatus;
  repository: {
    name: string;
    nameWithOwner: string;
    url: string;
    ownerLogin: string;
    ownerAvatarUrl: string;
  };
  requestedReviewers: Actor[];
  requestedTeams: TeamReviewer[];
  reviews: Array<Actor & { state: string }>;
  reviewDecision: ReviewDecision;
  authorLogin: string;
  /** PR description from GitHub (used for linked-PR grouping). */
  body: string | null;
  /** Group id: shared for linked PRs, unique per solo PR among your open PRs. */
  linkedGroupId: string | null;
  status: ReviewStatus;
  sessions: {
    review: boolean;
    triage: boolean;
  };
  reviewStatus: PrReviewStatus;
  developmentSync: DevelopmentSyncStatus | null;
};

export type Viewer = {
  login: string;
  name: string | null;
  avatarUrl: string;
};

export type RepoGroup = {
  nameWithOwner: string;
  name: string;
  url: string;
  ownerLogin: string;
  ownerAvatarUrl: string;
  prs: PullRequest[];
};

export type DashboardData = {
  viewer: Viewer;
  pullRequests: PullRequest[];
  /** Merged PRs linked to an open PR, shown only with Show merged on. */
  linkedMergedPullRequests: PullRequest[];
  repos: RepoGroup[];
};
