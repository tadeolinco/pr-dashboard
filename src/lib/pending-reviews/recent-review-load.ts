import {
    adjustPrLineStats,
    PrFilesCache,
} from "@/lib/diff-exclusions";
import { githubGraphql } from "@/lib/github-graphql";
import { withCombinedDiffLines } from "@/lib/pending-reviews/combined-diff";
import type {
    PendingReviewsPr,
    PendingReviewsRecentReview,
    PendingReviewsReviewer,
} from "@/lib/pending-reviews/types";
import { isBotActor } from "@/lib/bots";

const SEARCH_PAGE_SIZE = 50;
const REPO_SEARCH_CONCURRENCY = 6;
const PR_REVIEWS_LAST = 100;

/** Rolling window for “recent review load” fairness metric. */
export const RECENT_REVIEW_LOAD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Profile contributionsCollection omits private org reviews for other users (often
 * including the viewer). Per-repo search + review submittedAt matches PR data; org-level
 * `reviewed-by:` search omits some members (returns 0 hits while repo-scoped search works).
 */
const REVIEW_SEARCH_QUERY = `
query($q: String!, $cursor: String) {
  search(query: $q, type: ISSUE, first: ${SEARCH_PAGE_SIZE}, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number
        title
        url
        additions
        deletions
        changedFiles
        author { login avatarUrl }
        repository { nameWithOwner }
        reviews(last: ${PR_REVIEWS_LAST}) {
          nodes {
            state
            submittedAt
            author { __typename login }
          }
        }
      }
    }
  }
}
`;

type SearchPrNode = {
  number: number;
  title: string;
  url: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  author?: { login?: string | null; avatarUrl?: string | null } | null;
  repository: { nameWithOwner: string };
  reviews: {
    nodes: Array<{
      state: string;
      submittedAt: string | null;
      author: { __typename?: string; login?: string } | null;
    } | null>;
  };
};

type SearchQueryData = {
  search: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<SearchPrNode | null>;
  } | null;
};

export type RecentReviewLoadSlice = Pick<
  PendingReviewsReviewer,
  | "recent_review_count"
  | "recent_review_additions"
  | "recent_review_deletions"
  | "recent_review_diff_lines"
  | "recent_review_changed_files"
  | "recent_reviews"
>;

function recentReviewWindow(nowMs = Date.now()) {
  const fromMs = nowMs - RECENT_REVIEW_LOAD_MS;
  const sinceDate = new Date(fromMs).toISOString().slice(0, 10);
  return { fromMs, sinceDate };
}

function repoRecentReviewSearchQuery(repoFull: string, sinceDate: string) {
  return `repo:${repoFull} is:pr updated:>${sinceDate}`;
}

function repoInOrg(nameWithOwner: string, org: string) {
  const prefix = `${org.toLowerCase()}/`;
  return nameWithOwner.toLowerCase().startsWith(prefix);
}

function loginMatches(a: string | undefined | null, b: string) {
  return Boolean(a && a.toLowerCase() === b.toLowerCase());
}

/** At most one row per PR; excludes reviewing your own PR. */
async function reviewFromPrForLogin(
  token: string,
  pr: SearchPrNode,
  login: string,
  org: string,
  fromMs: number,
  prFilesCache: PrFilesCache,
): Promise<PendingReviewsRecentReview | null> {
  if (!repoInOrg(pr.repository.nameWithOwner, org)) return null;
  if (loginMatches(pr.author?.login, login)) return null;

  let latestMs: number | undefined;
  let latestSubmittedAt: string | undefined;
  let latestState = "";

  for (const review of pr.reviews?.nodes ?? []) {
    if (!review?.submittedAt) continue;
    const ms = Date.parse(review.submittedAt);
    if (Number.isNaN(ms) || ms < fromMs) continue;

    const reviewerLogin = review.author?.login;
    if (!loginMatches(reviewerLogin, login)) continue;
    if (isBotActor(reviewerLogin, review.author?.__typename)) continue;

    if (latestMs === undefined || ms > latestMs) {
      latestMs = ms;
      latestSubmittedAt = review.submittedAt;
      latestState = review.state;
    }
  }

  if (!latestSubmittedAt) return null;

  const [owner, repoName] = pr.repository.nameWithOwner.split("/", 2);
  const lineStats = await adjustPrLineStats(
    token,
    repoName,
    owner,
    pr.number,
    {
      additions: pr.additions ?? 0,
      deletions: pr.deletions ?? 0,
      changedFiles: pr.changedFiles ?? 0,
    },
    prFilesCache,
  );
  const additions = lineStats.additions;
  const deletions = lineStats.deletions;
  const changed_files = lineStats.changedFiles;

  return {
    repo: owner,
    repo_full: pr.repository.nameWithOwner,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    additions,
    deletions,
    diff_lines: additions + deletions,
    changed_files,
    submitted_at: latestSubmittedAt,
    state: latestState,
    author_login: pr.author?.login ?? undefined,
    author_avatar_url: pr.author?.avatarUrl ?? null,
  };
}

function tallyFromReviews(
  reviews: PendingReviewsRecentReview[],
): RecentReviewLoadSlice {
  const sorted = [...reviews].sort(
    (a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at),
  );
  const recent_review_additions = sorted.reduce((sum, r) => sum + r.additions, 0);
  const recent_review_deletions = sorted.reduce((sum, r) => sum + r.deletions, 0);
  return {
    recent_review_count: sorted.length,
    recent_review_additions,
    recent_review_deletions,
    recent_review_diff_lines:
      recent_review_additions + recent_review_deletions,
    recent_review_changed_files: sorted.reduce(
      (sum, r) => sum + r.changed_files,
      0,
    ),
    recent_reviews: sorted,
  };
}

export function emptyRecentReviewLoad(): RecentReviewLoadSlice {
  return tallyFromReviews([]);
}

async function searchRecentReviewPrNodes(
  token: string,
  q: string,
): Promise<SearchPrNode[]> {
  const nodes: SearchPrNode[] = [];
  let cursor: string | null = null;

  while (true) {
    const data: SearchQueryData = await githubGraphql(
      token,
      REVIEW_SEARCH_QUERY,
      { q, cursor },
    );

    const block = data.search;
    if (!block) break;

    for (const node of block.nodes) {
      if (node) nodes.push(node);
    }

    if (!block.pageInfo.hasNextPage) break;
    cursor = block.pageInfo.endCursor;
  }

  return nodes;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

export async function fetchRecentReviewLoadByLogin(
  token: string,
  org: string,
  logins: string[],
  repoFullNames: string[],
  nowMs = Date.now(),
): Promise<Map<string, RecentReviewLoadSlice>> {
  const window = recentReviewWindow(nowMs);
  const reviewsByLogin = new Map<string, PendingReviewsRecentReview[]>(
    logins.map((login) => [login, []]),
  );
  const prFilesCache = new PrFilesCache();

  await mapPool(repoFullNames, REPO_SEARCH_CONCURRENCY, async (repoFull) => {
    const q = repoRecentReviewSearchQuery(repoFull, window.sinceDate);
    try {
      const nodes = await searchRecentReviewPrNodes(token, q);
      for (const node of nodes) {
        for (const login of logins) {
          const row = await reviewFromPrForLogin(
            token,
            node,
            login,
            org,
            window.fromMs,
            prFilesCache,
          );
          if (!row) continue;
          reviewsByLogin.get(login)?.push(row);
        }
      }
    } catch (error) {
      console.warn(
        `[pending-reviews] recent review load failed for ${repoFull}:`,
        error instanceof Error ? error.message : error,
      );
    }
  });

  return new Map(
    logins.map((login) => [
      login,
      tallyFromReviews(reviewsByLogin.get(login) ?? []),
    ]),
  );
}

function pendingPrKey(pr: Pick<PendingReviewsPr, "repo_full" | "number">) {
  return `${pr.repo_full}#${pr.number}`;
}

/** Re-requested PRs stay in the pending queue; do not also count them in 7d load. */
export function recentReviewLoadExcludingPending(
  pendingPrs: PendingReviewsPr[],
  recent: RecentReviewLoadSlice,
): RecentReviewLoadSlice {
  const pendingKeys = new Set(pendingPrs.map(pendingPrKey));
  const reviews = (recent.recent_reviews ?? []).filter(
    (review) => !pendingKeys.has(pendingPrKey(review)),
  );
  return tallyFromReviews(reviews);
}

export function mergeRecentReviewLoad(
  reviewers: PendingReviewsReviewer[],
  loadByLogin: Map<string, RecentReviewLoadSlice>,
): PendingReviewsReviewer[] {
  return reviewers.map((row) => {
    const raw = loadByLogin.get(row.login) ?? emptyRecentReviewLoad();
    const recent = recentReviewLoadExcludingPending(row.prs, raw);
    return withCombinedDiffLines({ ...row, ...recent });
  });
}
