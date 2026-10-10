import { baseSyncSortRank } from "@/lib/pr-base-sync";
import { developmentSyncSortRank } from "@/lib/pr-development-sync";
import { getVisibleReviewerLogins, hasHumanReviewer } from "@/lib/pr-status";
import { triStateSortRank } from "@/lib/review-session/pr-health";
import type { CheckStatus, PullRequest, ReviewStatus } from "@/lib/types";

export type SortDirection = "asc" | "desc";

export type PrSortKey =
  | "repo"
  | "number"
  | "title"
  | "status"
  | "reviewers"
  | "checks"
  | "behind"
  | "inDev"
  | "review"
  | "clean"
  | "stale"
  | "triage"
  | "additions"
  | "deletions"
  | "total"
  | "createdAt"
  | "updatedAt";

export type PrSortState = {
  key: PrSortKey;
  direction: SortDirection;
};

export const DEFAULT_PR_SORT: PrSortState = {
  key: "updatedAt",
  direction: "desc",
};

const STATUS_RANK: Record<ReviewStatus, number> = {
  awaiting_reviewer: 0,
  review_requested: 1,
  commented: 2,
  changes_requested: 3,
  approved: 4,
};

export function defaultSortDirection(key: PrSortKey): SortDirection {
  switch (key) {
    case "repo":
    case "title":
    case "reviewers":
      return "asc";
    default:
      return "desc";
  }
}

export function sortPullRequests(
  pullRequests: PullRequest[],
  sort: PrSortState,
): PullRequest[] {
  return [...pullRequests].sort((a, b) =>
    compareValues(sortValue(a, sort.key), sortValue(b, sort.key), sort.direction),
  );
}

function sortValue(pr: PullRequest, key: PrSortKey): string | number {
  switch (key) {
    case "repo":
      return pr.repository.nameWithOwner;
    case "number":
      return pr.number;
    case "title":
      return pr.title.toLowerCase();
    case "status":
      return STATUS_RANK[pr.status];
    case "reviewers":
      return reviewerSortLabel(pr);
    case "checks":
      return checkRank(pr.checkStatus);
    case "behind":
      return baseSyncSortRank(pr.mergeStateStatus);
    case "inDev":
      return developmentSyncSortRank(pr.developmentSync);
    case "review":
      return pr.reviewStatus.round > 0 ? pr.reviewStatus.round : 0;
    case "clean":
      return triStateSortRank(pr, "clean");
    case "stale":
      return triStateSortRank(pr, "stale");
    case "triage":
      return pr.sessions.triage ? 1 : 0;
    case "additions":
      return pr.additions;
    case "deletions":
      return pr.deletions;
    case "total":
      return pr.additions + pr.deletions;
    case "createdAt":
      return Date.parse(pr.createdAt);
    case "updatedAt":
      return Date.parse(pr.updatedAt);
  }
}

function reviewerSortLabel(pr: PullRequest) {
  if (!hasHumanReviewer(pr)) return "";
  const logins = getVisibleReviewerLogins(pr);
  const teams = pr.requestedTeams.map((team) => team.name);
  return [...logins, ...teams].sort().join(", ").toLowerCase();
}

function checkRank(status: CheckStatus) {
  if (status === "SUCCESS") return 0;
  if (status === "PENDING" || status === "EXPECTED") return 1;
  if (status === null) return 2;
  return 3;
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
