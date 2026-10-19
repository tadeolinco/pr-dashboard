import {
    hasReviewSession,
    isNotCleanReview,
    isStaleReview,
} from "@/lib/review-session/pr-health";
import type { PullRequest, ReviewStatus } from "@/lib/types";

export type SessionFilter = "missing-review" | "missing-triage";

export type ReviewHealthFilter = "stale" | "not-clean";

export type DashboardView = "my-prs" | "my-review-queue" | "pending-reviews";

export type PrGroupMode = "flat" | "linked";

export type DashboardFilters = {
  view?: DashboardView;
  repo?: string;
  status?: ReviewStatus | "all";
  session?: SessionFilter;
  review?: ReviewHealthFilter;
  group?: PrGroupMode;
  /** Show merged PRs linked from visible open PRs. Off by default. */
  merged?: boolean;
  /** `?advanced=true` reveals advanced settings; it never changes what they're set to. */
  advanced?: boolean;
};

export function parseFiltersFromSearch(search: string): DashboardFilters {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  return parseFilters({
    view: params.get("view") ?? undefined,
    repo: params.get("repo") ?? undefined,
    status: params.get("status") ?? undefined,
    session: params.get("session") ?? undefined,
    review: params.get("review") ?? undefined,
    group: params.get("group") ?? undefined,
    merged: params.get("merged") ?? undefined,
    advanced: params.get("advanced") ?? undefined,
  });
}

export function parseFilters(searchParams: {
  view?: string | string[];
  repo?: string | string[];
  status?: string | string[];
  session?: string | string[];
  review?: string | string[];
  group?: string | string[];
  merged?: string | string[];
  advanced?: string | string[];
}): DashboardFilters {
  const view = first(searchParams.view);
  const repo = first(searchParams.repo);
  const status = first(searchParams.status);
  const session = first(searchParams.session);
  const review = first(searchParams.review);
  const group = first(searchParams.group);
  return {
    view: isDashboardView(view) ? view : "my-prs",
    repo,
    status: isReviewStatus(status) ? status : "all",
    session: isSessionFilter(session) ? session : undefined,
    review: isReviewHealthFilter(review) ? review : undefined,
    group: group === "linked" ? "linked" : "flat",
    merged: first(searchParams.merged) === "true" || undefined,
    advanced: first(searchParams.advanced) === "true" || undefined,
  };
}

export function withoutLocalSessionFilters(
  filters: DashboardFilters,
): DashboardFilters {
  return { ...filters, session: undefined, review: undefined };
}

export function dashboardHref(filters: DashboardFilters) {
  const params = new URLSearchParams();
  if (filters.view && filters.view !== "my-prs") params.set("view", filters.view);
  if (filters.repo) params.set("repo", filters.repo);
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.session) params.set("session", filters.session);
  if (filters.review) params.set("review", filters.review);
  if (filters.group === "linked") params.set("group", "linked");
  if (filters.merged) params.set("merged", "true");
  if (filters.advanced) params.set("advanced", "true");
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export function filterPullRequests(prs: PullRequest[], filters: DashboardFilters) {
  const matchingGroups =
    filters.status && filters.status !== "all" && filters.group === "linked"
      ? linkedGroupIdsWithStatus(prs, filters.status)
      : null;
  return prs.filter((pr) => {
    if (filters.repo && pr.repository.nameWithOwner !== filters.repo) return false;
    if (
      filters.status &&
      filters.status !== "all" &&
      pr.status !== filters.status &&
      !(pr.linkedGroupId && matchingGroups?.has(pr.linkedGroupId))
    ) {
      return false;
    }
    if (filters.session === "missing-review" && hasReviewSession(pr)) {
      return false;
    }
    if (filters.session === "missing-triage" && pr.sessions.triage) return false;
    if (filters.review === "stale" && !isStaleReview(pr)) return false;
    if (filters.review === "not-clean" && !isNotCleanReview(pr)) return false;
    return true;
  });
}

/**
 * Linked groups with at least one PR in `status`. With grouping on, a status
 * filter keeps the whole group so the other PRs in it show next to the match.
 */
export function linkedGroupIdsWithStatus(prs: PullRequest[], status: ReviewStatus) {
  const ids = new Set<string>();
  for (const pr of prs) {
    if (pr.status === status && pr.linkedGroupId) ids.add(pr.linkedGroupId);
  }
  return ids;
}

/**
 * Adds the linked PRs whose group has a visible PR of yours: open PRs by
 * someone else always, merged PRs only with Show merged on. Neither shows on
 * its own.
 */
export function withLinkedPullRequests(
  visible: PullRequest[],
  linked: { merged: PullRequest[]; open: PullRequest[] },
  filters: DashboardFilters,
) {
  const extra = [
    ...linkedMergedPullRequests(visible, linked.open),
    ...(filters.merged ? linkedMergedPullRequests(visible, linked.merged) : []),
  ];
  return extra.length ? [...visible, ...extra] : visible;
}

/** PRs from `linked` in a linked group with at least one of `visible`. */
export function linkedMergedPullRequests(
  visible: PullRequest[],
  merged: PullRequest[],
) {
  const groups = new Set(visible.map((pr) => pr.linkedGroupId));
  return merged.filter(
    (pr) => pr.linkedGroupId && groups.has(pr.linkedGroupId),
  );
}

/**
 * Free-text search over title, number, repo, branch and author. Every
 * whitespace-separated term must match somewhere.
 */
export function searchPullRequests(prs: PullRequest[], query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return prs;
  return prs.filter((pr) => {
    const haystack = [
      pr.title,
      `#${pr.number}`,
      pr.repository.nameWithOwner,
      pr.headRefName,
      pr.authorLogin,
    ]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

function first(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function isSessionFilter(value: string | undefined): value is SessionFilter {
  return value === "missing-review" || value === "missing-triage";
}

function isReviewHealthFilter(
  value: string | undefined,
): value is ReviewHealthFilter {
  return value === "stale" || value === "not-clean";
}

function isDashboardView(value: string | undefined): value is DashboardView {
  return (
    value === "my-prs" ||
    value === "my-review-queue" ||
    value === "pending-reviews"
  );
}

function isReviewStatus(value: string | undefined): value is ReviewStatus {
  return (
    value === "awaiting_reviewer" ||
    value === "review_requested" ||
    value === "commented" ||
    value === "changes_requested" ||
    value === "approved"
  );
}
