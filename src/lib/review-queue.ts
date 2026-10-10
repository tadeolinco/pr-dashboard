import { fetchGithubReviewRequestedPullRequests } from "@/lib/github";
import { stackAwarePendingKeysForLogin } from "@/lib/pending-reviews/fetch";
import type { PrScope } from "@/lib/scope";
import type { PullRequest } from "@/lib/types";

function prKey(pr: PullRequest) {
  return `${pr.repository.nameWithOwner}#${pr.number}`;
}

export async function fetchMyReviewQueuePullRequests(
  token: string,
  viewerLogin: string,
  scope: PrScope,
): Promise<PullRequest[]> {
  const { pullRequests } = await fetchGithubReviewRequestedPullRequests(
    token,
    scope,
  );
  if (pullRequests.length === 0) return [];

  const repoFullNames = [
    ...new Set(pullRequests.map((pr) => pr.repository.nameWithOwner)),
  ];
  const allowed = await stackAwarePendingKeysForLogin(
    token,
    viewerLogin,
    repoFullNames,
  );

  return pullRequests.filter((pr) => allowed.has(prKey(pr)));
}
