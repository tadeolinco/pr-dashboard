import { githubFetchWithRetry } from "@/lib/github-graphql";
import { matchesAnyGlob } from "@/lib/glob";
import { ignoredPathPatterns } from "@/lib/repo-settings";
import type { PullRequest } from "@/lib/types";

const GITHUB_REST = "https://api.github.com";

export type PrLineStats = {
  additions: number;
  deletions: number;
  changedFiles: number;
};

type RestPrFile = {
  filename: string;
  additions: number;
  deletions: number;
};

/** Subtract files matching the repo's ignored-path globs from PR line stats. */
export function subtractIgnoredFilesFromStats(
  stats: PrLineStats,
  files: Array<{ filename: string; additions: number; deletions: number }>,
  patterns: RegExp[],
): PrLineStats {
  let ignoredAdditions = 0;
  let ignoredDeletions = 0;
  let ignoredFileCount = 0;

  for (const file of files) {
    if (!matchesAnyGlob(file.filename, patterns)) continue;
    ignoredAdditions += file.additions;
    ignoredDeletions += file.deletions;
    ignoredFileCount += 1;
  }

  if (ignoredFileCount === 0) return stats;

  return {
    additions: Math.max(0, stats.additions - ignoredAdditions),
    deletions: Math.max(0, stats.deletions - ignoredDeletions),
    changedFiles: Math.max(0, stats.changedFiles - ignoredFileCount),
  };
}

function parseNextLink(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

async function fetchPullRequestFiles(
  token: string,
  owner: string,
  repo: string,
  number: number,
): Promise<RestPrFile[]> {
  const files: RestPrFile[] = [];
  let url: string | null =
    `${GITHUB_REST}/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`;

  while (url) {
    const response = await githubFetchWithRetry(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(typeof window === "undefined"
          ? { "User-Agent": "pr-dashboard" }
          : {}),
      },
    });
    if (!response.ok) {
      throw new Error(
        `GitHub REST pulls/${number}/files failed (${response.status})`,
      );
    }
    const page = (await response.json()) as RestPrFile[];
    files.push(...page);
    url = parseNextLink(response.headers.get("link"));
  }

  return files;
}

export class PrFilesCache {
  private readonly filesByPr = new Map<string, Promise<RestPrFile[]>>();

  private prKey(owner: string, repo: string, number: number) {
    return `${owner}/${repo}#${number}`;
  }

  loadFiles(
    token: string,
    owner: string,
    repo: string,
    number: number,
  ): Promise<RestPrFile[]> {
    const key = this.prKey(owner, repo, number);
    let pending = this.filesByPr.get(key);
    if (!pending) {
      pending = fetchPullRequestFiles(token, owner, repo, number);
      this.filesByPr.set(key, pending);
    }
    return pending;
  }
}

export async function adjustPrLineStats(
  token: string,
  repoName: string,
  owner: string,
  pullNumber: number,
  stats: PrLineStats,
  cache: PrFilesCache = new PrFilesCache(),
): Promise<PrLineStats> {
  const patterns = ignoredPathPatterns(repoName);
  if (patterns.length === 0) return stats;

  try {
    const files = await cache.loadFiles(token, owner, repoName, pullNumber);
    return subtractIgnoredFilesFromStats(stats, files, patterns);
  } catch (error) {
    console.warn(
      `[diff-exclusions] could not adjust ${owner}/${repoName}#${pullNumber}:`,
      error instanceof Error ? error.message : error,
    );
    return stats;
  }
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      await fn(items[i]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
}

/** Apply each repo's ignored-path globs to dashboard PR stats. */
export async function adjustPullRequestsLineStats(
  token: string,
  pullRequests: PullRequest[],
  options?: { concurrency?: number; cache?: PrFilesCache },
): Promise<void> {
  const cache = options?.cache ?? new PrFilesCache();
  const targets = pullRequests.filter(
    (pr) => ignoredPathPatterns(pr.repository.name).length > 0,
  );
  if (targets.length === 0) return;

  await mapPool(targets, options?.concurrency ?? 6, async (pr) => {
    const [owner] = pr.repository.nameWithOwner.split("/", 2);
    const adjusted = await adjustPrLineStats(
      token,
      pr.repository.name,
      owner,
      pr.number,
      {
        additions: pr.additions,
        deletions: pr.deletions,
        changedFiles: pr.changedFiles,
      },
      cache,
    );
    pr.additions = adjusted.additions;
    pr.deletions = adjusted.deletions;
    pr.changedFiles = adjusted.changedFiles;
  });
}
