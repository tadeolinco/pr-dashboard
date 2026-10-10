import { githubFetchWithRetry } from "@/lib/github-graphql";
import { integrationBranchForRepository } from "@/lib/repo-settings";
import type { DevelopmentSyncStatus } from "@/lib/types";

const GITHUB_REST = "https://api.github.com";
const COMPARE_CONCURRENCY = 8;

type ComparePullRequest = {
  id: string;
  headRefOid: string | null;
  repository: { name: string; nameWithOwner: string };
};

export async function fetchDevelopmentSyncStatuses(
  token: string,
  pullRequests: ComparePullRequest[],
): Promise<Record<string, DevelopmentSyncStatus>> {
  const result: Record<string, DevelopmentSyncStatus> = {};
  const branchExistsByRepo = new Map<string, boolean>();

  const jobs = pullRequests.map((pr) => async () => {
    const branch = integrationBranchForRepository(pr.repository.name);
    if (!pr.headRefOid) {
      result[pr.id] = "unknown";
      return;
    }

    const repoKey = pr.repository.nameWithOwner;
    let hasBranch = branchExistsByRepo.get(repoKey);
    if (hasBranch === undefined) {
      hasBranch = await repositoryHasBranch(token, repoKey, branch);
      branchExistsByRepo.set(repoKey, hasBranch);
    }

    if (!hasBranch) {
      result[pr.id] = "unavailable";
      return;
    }

    result[pr.id] = await headContainedInBranch(
      token,
      repoKey,
      branch,
      pr.headRefOid,
    );
  });

  await runPool(jobs, COMPARE_CONCURRENCY);
  return result;
}

async function repositoryHasBranch(
  token: string,
  nameWithOwner: string,
  branch: string,
): Promise<boolean> {
  const url = `${GITHUB_REST}/repos/${nameWithOwner}/branches/${encodeURIComponent(branch)}`;
  const response = await githubFetchWithRetry(url, {
    headers: githubRestHeaders(token),
  });
  if (response.status === 404) return false;
  if (!response.ok) return false;
  return true;
}

async function headContainedInBranch(
  token: string,
  nameWithOwner: string,
  branch: string,
  headOid: string,
): Promise<DevelopmentSyncStatus> {
  const url = `${GITHUB_REST}/repos/${nameWithOwner}/compare/${encodeURIComponent(branch)}...${headOid}`;
  const response = await githubFetchWithRetry(url, {
    headers: githubRestHeaders(token),
  });

  if (response.status === 404) return "unknown";
  if (!response.ok) return "unknown";

  const json = (await response.json()) as {
    ahead_by?: number;
  };

  if (typeof json.ahead_by !== "number") return "unknown";
  return json.ahead_by === 0 ? "in_dev" : "not_in_dev";
}

function githubRestHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    ...(typeof window === "undefined" ? { "User-Agent": "pr-dashboard" } : {}),
  };
}

async function runPool<T>(jobs: Array<() => Promise<T>>, concurrency: number) {
  let index = 0;
  async function worker() {
    while (index < jobs.length) {
      const job = jobs[index];
      index += 1;
      await job();
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, jobs.length) },
    () => worker(),
  );
  await Promise.all(workers);
}
