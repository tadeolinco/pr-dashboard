import { assembleDashboardData } from "../src/lib/dashboard-data.ts";
import { fetchGithubPullRequests } from "../src/lib/github.ts";
import { fetchMyReviewQueuePullRequests } from "../src/lib/review-queue.ts";
import type { PrScope } from "../src/lib/scope.ts";

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("GITHUB_TOKEN missing");
  process.exit(1);
}

// Usage: GITHUB_TOKEN=… npx tsx scripts/test-dashboard-load.mts <org> [<org> …]
const owners = process.argv.slice(2);
if (owners.length === 0) {
  console.error("Pass at least one org or user login");
  process.exit(1);
}
const scope: PrScope = {
  owners: owners.map((login) => ({
    login,
    type: "Organization",
    avatarUrl: null,
    repos: null,
  })),
};

async function main() {
  try {
    const { viewer, pullRequests } = await fetchGithubPullRequests(token!, scope);
    console.log("my PRs", pullRequests.length, viewer.login);
  } catch (e) {
    console.error("my PRs FAIL", e);
  }

  try {
    const { viewer } = await fetchGithubPullRequests(token!, scope);
    const q = await fetchMyReviewQueuePullRequests(token!, viewer.login, scope);
    console.log("queue", q.length);
  } catch (e) {
    console.error("queue FAIL", e);
  }

  try {
    const d = await assembleDashboardData(token!, scope);
    console.log("assemble ok", d.pullRequests.length);
  } catch (e) {
    console.error("assemble FAIL", e);
    process.exit(1);
  }
}

main();
