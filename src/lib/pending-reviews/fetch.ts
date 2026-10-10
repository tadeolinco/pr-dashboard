import {
    adjustPrLineStats,
    PrFilesCache,
} from "@/lib/diff-exclusions";
import { githubFetchWithRetry, githubGraphql } from "@/lib/github-graphql";
import {
    fetchRecentReviewLoadByLogin,
    mergeRecentReviewLoad,
} from "@/lib/pending-reviews/recent-review-load";
import {
    selectPrsReachingBase,
    stackParentFor,
    type StackOpenPr,
} from "@/lib/pending-reviews/stack";
import type {
    PendingReviewsPr,
    PendingReviewsReport,
    PendingReviewsReviewer,
} from "@/lib/pending-reviews/types";
import { isBotActor } from "@/lib/bots";
import type { ReviewDecision } from "@/lib/pr-status";
import {
  FALLBACK_TARGET_BRANCH,
  targetBranchForRepository,
} from "@/lib/repo-settings";

const GITHUB_REST = "https://api.github.com";
const OPEN_PR_PAGE_SIZE = 50;
const REPO_CONCURRENCY = 6;

const REPO_OPEN_PRS_QUERY = `
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef { name }
    pullRequests(states: OPEN, first: ${OPEN_PR_PAGE_SIZE}, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number
        title
        url
        isDraft
        baseRefName
        headRefName
        additions
        deletions
        changedFiles
        reviewDecision
        author { login avatarUrl }
        reviewRequests(first: 20) {
          nodes {
            requestedReviewer {
              __typename
              ... on User { login }
              ... on Team { slug }
            }
          }
        }
        commits(last: 1) {
          nodes {
            commit {
              committedDate
            }
          }
        }
        latestReviews(first: 20) {
          nodes {
            state
            submittedAt
            author {
              __typename
              login
            }
          }
        }
      }
    }
  }
}
`;

const ORG_REPOS_QUERY = `
query($org: String!, $cursor: String) {
  organization(login: $org) {
    repositories(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { nameWithOwner }
    }
  }
}
`;

type GraphqlPrNode = {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  baseRefName: string;
  headRefName: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  reviewDecision: ReviewDecision;
  author?: { login: string; avatarUrl?: string | null } | null;
  commits: {
    nodes: Array<{
      commit: { committedDate: string } | null;
    } | null>;
  };
  latestReviews: {
    nodes: Array<{
      state: string;
      submittedAt: string | null;
      author: { __typename?: string; login?: string } | null;
    }>;
  };
  reviewRequests: {
    nodes: Array<{
      requestedReviewer: {
        __typename?: string;
        login?: string;
        slug?: string;
      } | null;
    }>;
  };
};

function lastCommitAtFromNode(node: GraphqlPrNode): string | undefined {
  for (const entry of node.commits?.nodes ?? []) {
    const date = entry?.commit?.committedDate;
    if (date) return date;
  }
  return undefined;
}

function lastHumanReviewAtFromNode(node: GraphqlPrNode): string | undefined {
  let latestMs: number | undefined;
  let latestIso: string | undefined;
  for (const review of node.latestReviews?.nodes ?? []) {
    const login = review.author?.login;
    if (!login || isBotActor(login, review.author?.__typename)) continue;
    if (!review.submittedAt) continue;
    const ms = Date.parse(review.submittedAt);
    if (Number.isNaN(ms)) continue;
    if (latestMs === undefined || ms > latestMs) {
      latestMs = ms;
      latestIso = review.submittedAt;
    }
  }
  return latestIso;
}

async function githubRestPaginated<T>(
  token: string,
  path: string,
): Promise<T[]> {
  const items: T[] = [];
  let url: string | null = `${GITHUB_REST}${path}`;

  while (url) {
    const response = await githubFetchWithRetry(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        ...(typeof window === "undefined"
          ? { "User-Agent": "pr-dashboard" }
          : {}),
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub REST ${path} failed (${response.status})`);
    }
    const page = (await response.json()) as T[];
    items.push(...page);
    const link = response.headers.get("link");
    url = parseNextLink(link);
  }

  return items;
}

function parseNextLink(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

type OrgReposData = {
  organization: {
    repositories: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<{ nameWithOwner: string } | null>;
    };
  } | null;
};

async function listOrgRepos(token: string, org: string) {
  const names: string[] = [];
  let cursor: string | null = null;

  do {
    const data: OrgReposData = await githubGraphql(token, ORG_REPOS_QUERY, {
      org,
      cursor,
    });

    const block = data.organization?.repositories;
    if (!block) break;
    for (const node of block.nodes) {
      if (node?.nameWithOwner) names.push(node.nameWithOwner);
    }
    cursor = block.pageInfo.hasNextPage ? block.pageInfo.endCursor : null;
  } while (cursor);

  return names;
}

type OrgMember = { login: string; avatar_url: string };

async function listOrgMembers(token: string, org: string): Promise<OrgMember[]> {
  const members = await githubRestPaginated<OrgMember>(
    token,
    `/orgs/${org}/members?per_page=100`,
  );
  return members.sort((a, b) =>
    a.login.localeCompare(b.login, undefined, { sensitivity: "base" }),
  );
}

async function teamMemberLogins(
  token: string,
  org: string,
  teamSlug: string,
  cache: Map<string, Set<string>>,
): Promise<Set<string>> {
  const key = `${org}/${teamSlug}`;
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const members = await githubRestPaginated<{ login: string }>(
      token,
      `/orgs/${org}/teams/${teamSlug}/members?per_page=100`,
    );
    const logins = new Set(members.map((m) => m.login));
    cache.set(key, logins);
    return logins;
  } catch {
    cache.set(key, new Set());
    return new Set();
  }
}

/** Open review requests only — not reviewers who commented without a re-request. */
async function pendingReviewerLoginsForNode(
  token: string,
  org: string,
  node: GraphqlPrNode,
  teamCache: Map<string, Set<string>>,
): Promise<Set<string>> {
  return requestedUserLoginsFromNode(token, org, node, teamCache);
}

async function requestedUserLoginsFromNode(
  token: string,
  org: string,
  node: GraphqlPrNode,
  teamCache: Map<string, Set<string>>,
): Promise<Set<string>> {
  const logins = new Set<string>();
  for (const req of node.reviewRequests.nodes) {
    const reviewer = req.requestedReviewer;
    if (!reviewer) continue;
    if (reviewer.login) {
      logins.add(reviewer.login);
      continue;
    }
    if (reviewer.slug) {
      const teamLogins = await teamMemberLogins(token, org, reviewer.slug, teamCache);
      for (const login of teamLogins) logins.add(login);
    }
  }
  return logins;
}

type RepoOpenPrsData = {
  repository: {
    defaultBranchRef: { name: string } | null;
    pullRequests: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<GraphqlPrNode | null>;
    };
  } | null;
};

/** Open PRs plus the branch stacks must reach (Repo settings, else GitHub default). */
async function fetchOpenPrNodes(
  token: string,
  owner: string,
  name: string,
): Promise<{ nodes: GraphqlPrNode[]; targetBranch: string }> {
  const nodes: GraphqlPrNode[] = [];
  let cursor: string | null = null;
  let defaultBranch: string | null = null;

  while (true) {
    const data: RepoOpenPrsData = await githubGraphql(
      token,
      REPO_OPEN_PRS_QUERY,
      { owner, name, cursor },
    );

    defaultBranch ??= data.repository?.defaultBranchRef?.name ?? null;
    const block = data.repository?.pullRequests;
    if (!block) break;
    for (const node of block.nodes) {
      if (node) nodes.push(node);
    }
    if (!block.pageInfo.hasNextPage) break;
    cursor = block.pageInfo.endCursor;
  }

  return {
    nodes,
    targetBranch:
      targetBranchForRepository(name) ?? defaultBranch ?? FALLBACK_TARGET_BRANCH,
  };
}

async function pendingByReviewerFromRepo(
  token: string,
  org: string,
  repoFull: string,
  includeDrafts: boolean,
  teamCache: Map<string, Set<string>>,
  prFilesCache: PrFilesCache,
): Promise<Map<string, PendingReviewsPr[]>> {
  const [owner, name] = repoFull.split("/", 2);
  const pending = new Map<string, PendingReviewsPr[]>();
  const seen = new Map<string, Set<string>>();

  const candidates: StackOpenPr[] = [];
  const { nodes, targetBranch: baseBranch } = await fetchOpenPrNodes(
    token,
    owner,
    name,
  );
  for (const node of nodes) {
    if (node.isDraft && !includeDrafts) continue;
    const lineStats = await adjustPrLineStats(
      token,
      name,
      owner,
      node.number,
      {
        additions: node.additions ?? 0,
        deletions: node.deletions ?? 0,
        changedFiles: node.changedFiles ?? 0,
      },
      prFilesCache,
    );
    candidates.push({
      number: node.number,
      title: node.title,
      url: node.url,
      baseRef: node.baseRefName,
      headRef: node.headRefName,
      additions: lineStats.additions,
      deletions: lineStats.deletions,
      changedFiles: lineStats.changedFiles,
      lastCommitAt: lastCommitAtFromNode(node),
      lastHumanReviewAt: lastHumanReviewAtFromNode(node),
      authorLogin: node.author?.login,
      authorAvatarUrl: node.author?.avatarUrl ?? null,
      requestedLogins: await pendingReviewerLoginsForNode(
        token,
        org,
        node,
        teamCache,
      ),
    });
  }

  const inStack = selectPrsReachingBase(candidates, baseBranch);
  for (const pr of inStack) {
    const parent = stackParentFor(pr, inStack, baseBranch);
    const row: PendingReviewsPr = {
      repo: name,
      repo_full: repoFull,
      number: pr.number,
      title: pr.title,
      url: pr.url,
      additions: pr.additions,
      deletions: pr.deletions,
      diff_lines: pr.additions + pr.deletions,
      changed_files: pr.changedFiles,
      base_ref: pr.baseRef,
      head_ref: pr.headRef,
      stack_parent: parent,
      author_login: pr.authorLogin,
      author_avatar_url: pr.authorAvatarUrl,
      lastCommitAt: pr.lastCommitAt,
      lastHumanReviewAt: pr.lastHumanReviewAt,
    };

    for (const login of pr.requestedLogins) {
      const key = `${repoFull}#${row.number}`;
      let seenForLogin = seen.get(login);
      if (!seenForLogin) {
        seenForLogin = new Set();
        seen.set(login, seenForLogin);
      }
      if (seenForLogin.has(key)) continue;
      seenForLogin.add(key);

      const list = pending.get(login);
      if (list) list.push(row);
      else pending.set(login, [row]);
    }
  }

  return pending;
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

function uniquePrCount(reviewers: PendingReviewsReviewer[]) {
  const seen = new Set<string>();
  for (const reviewer of reviewers) {
    for (const pr of reviewer.prs) {
      seen.add(`${pr.repo_full}#${pr.number}`);
    }
  }
  return seen.size;
}

function buildReviewerTallies(
  members: OrgMember[],
  pending: Map<string, PendingReviewsPr[]>,
): PendingReviewsReviewer[] {
  return members.map(({ login, avatar_url }) => {
    const prs = [...(pending.get(login) ?? [])].sort(
      (a, b) => b.diff_lines - a.diff_lines,
    );
    const total_additions = prs.reduce((sum, p) => sum + p.additions, 0);
    const total_deletions = prs.reduce((sum, p) => sum + p.deletions, 0);
    return {
      login,
      avatar_url,
      count: prs.length,
      total_additions,
      total_deletions,
      total_diff_lines: total_additions + total_deletions,
      total_changed_files: prs.reduce((sum, p) => sum + p.changed_files, 0),
      prs,
    };
  });
}

export async function stackAwarePendingKeysForLogin(
  token: string,
  login: string,
  repoFullNames: string[],
  options?: { includeDrafts?: boolean },
): Promise<Set<string>> {
  const includeDrafts = options?.includeDrafts ?? false;
  const teamCache = new Map<string, Set<string>>();
  const keys = new Set<string>();

  await mapPool(repoFullNames, REPO_CONCURRENCY, async (repoFull) => {
    const [owner, name] = repoFull.split("/", 2);
    const candidates: StackOpenPr[] = [];
    const { nodes, targetBranch: baseBranch } = await fetchOpenPrNodes(
      token,
      owner,
      name,
    );
    for (const node of nodes) {
      if (node.isDraft && !includeDrafts) continue;
      candidates.push({
        number: node.number,
        title: node.title,
        url: node.url,
        baseRef: node.baseRefName,
        headRef: node.headRefName,
        additions: node.additions ?? 0,
        deletions: node.deletions ?? 0,
        changedFiles: node.changedFiles ?? 0,
        lastCommitAt: lastCommitAtFromNode(node),
        lastHumanReviewAt: lastHumanReviewAtFromNode(node),
        // Team review requests resolve against the repo owner's teams.
        requestedLogins: await pendingReviewerLoginsForNode(
          token,
          owner,
          node,
          teamCache,
        ),
      });
    }

    const inStack = selectPrsReachingBase(candidates, baseBranch);
    for (const pr of inStack) {
      if (pr.requestedLogins.has(login)) {
        keys.add(`${repoFull}#${pr.number}`);
      }
    }
  });

  return keys;
}

export async function fetchPendingReviewsReport(
  token: string,
  org: string,
  options?: {
    /** Repo names (without owner) to scan; every org repo when omitted. */
    repos?: string[] | null;
    includeDrafts?: boolean;
  },
): Promise<PendingReviewsReport> {
  const includeDrafts = options?.includeDrafts ?? false;

  const [repoFullNames, orgMembers] = await Promise.all([
    options?.repos
      ? Promise.resolve(options.repos.map((repo) => `${org}/${repo}`))
      : listOrgRepos(token, org),
    listOrgMembers(token, org),
  ]);

  const reviewers = orgMembers.filter(
    (member) => !isBotActor(member.login),
  );
  const pending = new Map<string, PendingReviewsPr[]>();
  const teamCache = new Map<string, Set<string>>();
  const prFilesCache = new PrFilesCache();

  const logins = reviewers.map((member) => member.login);

  const repoMaps = await mapPool(repoFullNames, REPO_CONCURRENCY, (repoFull) =>
    pendingByReviewerFromRepo(
      token,
      org,
      repoFull,
      includeDrafts,
      teamCache,
      prFilesCache,
    ),
  );

  for (const repoPending of repoMaps) {
    for (const [login, prs] of repoPending) {
      const existing = pending.get(login);
      if (existing) existing.push(...prs);
      else pending.set(login, [...prs]);
    }
  }

  const recentLoadByLogin = await fetchRecentReviewLoadByLogin(
    token,
    org,
    logins,
    repoFullNames,
  );
  const tallies = mergeRecentReviewLoad(
    buildReviewerTallies(reviewers, pending),
    recentLoadByLogin,
  );
  const generated_at_utc = new Date()
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);

  return {
    org,
    generated_at_utc,
    reviewers: tallies,
    summary: {
      reviewer_rows_with_pending: tallies.filter((t) => t.count > 0).length,
      sum_of_pending_rows: tallies.reduce((sum, t) => sum + t.count, 0),
      sum_of_diff_lines: tallies.reduce((sum, t) => sum + t.total_diff_lines, 0),
      unique_prs: uniquePrCount(tallies),
      sum_of_recent_review_diff_lines: tallies.reduce(
        (sum, t) => sum + (t.recent_review_diff_lines ?? 0),
        0,
      ),
    },
  };
}
