import {
    buildDocsIndex,
    enrichPullRequestsWithDocs,
    type DocsIndexData,
} from "@/lib/docs-index";
import {
    MissingGithubTokenError,
    fetchGithubPullRequests,
} from "@/lib/github";
import { assignLinkedPullRequestGroups } from "@/lib/pr-links";
import { fetchMyReviewQueuePullRequests } from "@/lib/review-queue";
import { scopeKey, type PrScope } from "@/lib/scope";
import type { DashboardData, PullRequest } from "@/lib/types";

export { MissingGithubTokenError };

const GITHUB_TTL_MS = 60_000;
const DOCS_TTL_MS = 30_000;

type CacheEntry<T> = { key: string; value: T; expiresAt: number };

let githubDashboardCache: CacheEntry<
  Pick<DashboardData, "viewer" | "pullRequests">
> | null = null;
let reviewQueueCache: CacheEntry<PullRequest[]> | null = null;
let docsIndexCache: {
  root: FileSystemDirectoryHandle;
  value: DocsIndexData;
  expiresAt: number;
} | null = null;

export function invalidateDashboardCaches() {
  githubDashboardCache = null;
  reviewQueueCache = null;
  docsIndexCache = null;
}

export async function getCachedGithubDashboard(
  token: string,
  scope: PrScope,
): Promise<Pick<DashboardData, "viewer" | "pullRequests">> {
  const key = `${token}:${scopeKey(scope)}`;
  const hit = readCache(githubDashboardCache, key);
  if (hit) return hit;

  const { viewer, pullRequests } = await fetchGithubPullRequests(token, scope);
  const value = { viewer, pullRequests };
  githubDashboardCache = {
    key,
    value,
    expiresAt: Date.now() + GITHUB_TTL_MS,
  };
  return value;
}

export async function getCachedReviewQueue(
  token: string,
  viewerLogin: string,
  scope: PrScope,
): Promise<PullRequest[]> {
  const key = `${token}:${viewerLogin}:${scopeKey(scope)}`;
  const hit = readCache(reviewQueueCache, key);
  if (hit) return hit;

  const value = await fetchMyReviewQueuePullRequests(token, viewerLogin, scope);
  reviewQueueCache = {
    key,
    value,
    expiresAt: Date.now() + GITHUB_TTL_MS,
  };
  return value;
}

export async function getCachedDocsIndex(docsRoot: FileSystemDirectoryHandle) {
  if (
    docsIndexCache &&
    docsIndexCache.root === docsRoot &&
    Date.now() < docsIndexCache.expiresAt
  ) {
    return docsIndexCache.value;
  }

  const value = await buildDocsIndex(docsRoot);
  docsIndexCache = {
    root: docsRoot,
    value,
    expiresAt: Date.now() + DOCS_TTL_MS,
  };
  return value;
}

export async function assembleDashboardData(
  token: string,
  scope: PrScope,
  docsRoot: FileSystemDirectoryHandle | null = null,
): Promise<DashboardData> {
  const { viewer, pullRequests } = await getCachedGithubDashboard(token, scope);
  assignLinkedPullRequestGroups(pullRequests);
  if (docsRoot) {
    const docsIndex = await getCachedDocsIndex(docsRoot);
    enrichPullRequestsWithDocs(pullRequests, docsIndex);
  }

  return {
    viewer,
    pullRequests,
    repos: groupByRepository(pullRequests),
  };
}

function readCache<T>(entry: CacheEntry<T> | null, key: string): T | null {
  if (!entry || entry.key !== key) return null;
  if (Date.now() >= entry.expiresAt) return null;
  return entry.value;
}

function groupByRepository(
  pullRequests: DashboardData["pullRequests"],
): DashboardData["repos"] {
  const groups = new Map<string, DashboardData["repos"][number]>();

  for (const pr of pullRequests) {
    const existing = groups.get(pr.repository.nameWithOwner);
    if (existing) {
      existing.prs.push(pr);
      continue;
    }
    groups.set(pr.repository.nameWithOwner, {
      nameWithOwner: pr.repository.nameWithOwner,
      name: pr.repository.name,
      url: pr.repository.url,
      ownerLogin: pr.repository.ownerLogin,
      ownerAvatarUrl: pr.repository.ownerAvatarUrl,
      prs: [pr],
    });
  }

  return [...groups.values()].sort((a, b) => {
    if (b.prs.length !== a.prs.length) return b.prs.length - a.prs.length;
    return a.nameWithOwner.localeCompare(b.nameWithOwner);
  });
}
