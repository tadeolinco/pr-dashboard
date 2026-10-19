import { isBotActor } from "@/lib/bots";
import { adjustPullRequestsLineStats } from "@/lib/diff-exclusions";
import { extractPullRequestMentions } from "@/lib/pr-links";
import { deriveReviewStatus, type ReviewDecision } from "@/lib/pr-status";
import { repoInScope, type PrScope } from "@/lib/scope";
import type {
    Actor,
    CheckStatus,
    PullRequest,
    TeamReviewer,
    Viewer,
} from "@/lib/types";

const GITHUB_GRAPHQL = "https://api.github.com/graphql";
const PAGE_SIZE = 50;
const MAX_PRS = 200;
/** Search spans all of GitHub, so stop paging even if few results were in scope. */
const MAX_SEARCH_PAGES = 10;
/** Mentioned PRs looked up per dashboard load to find merged linked PRs. */
const MAX_LINKED_LOOKUPS = 60;
const LINKED_LOOKUPS_PER_QUERY = 20;

// Searches cover every repo the token can see; results are then narrowed to
// the user's chosen scope (see src/lib/scope.ts).
const OPEN_AUTHORED_SEARCH = "is:pr is:open author:@me -is:draft";
const REVIEW_REQUESTED_SEARCH = "is:pr is:open review-requested:@me -is:draft";

const PULL_REQUEST_FIELDS = `
  id
  number
  title
  body
  url
  isDraft
  createdAt
  updatedAt
  state
  mergedAt
  additions
  deletions
  changedFiles
  headRefName
  baseRefName
  mergeStateStatus
  reviewDecision
  author {
    login
  }
  repository {
    name
    nameWithOwner
    url
    owner {
      login
      avatarUrl
    }
  }
  reviewRequests(first: 20) {
    nodes {
      requestedReviewer {
        __typename
        ... on User {
          login
          avatarUrl
        }
        ... on Team {
          name
          combinedSlug
          avatarUrl
        }
      }
    }
  }
  latestReviews(first: 20) {
    nodes {
      state
      author {
        __typename
        login
        ... on User { avatarUrl }
        ... on Bot { avatarUrl }
      }
    }
  }
  latestOpinionatedReviews(first: 20) {
    nodes {
      state
      author {
        __typename
        login
        ... on User { avatarUrl }
        ... on Bot { avatarUrl }
      }
    }
  }
  commits(last: 1) {
    nodes {
      commit {
        oid
      }
    }
  }
`;

const OPEN_PULL_REQUESTS_QUERY = `
  query OrgOpenPullRequests($query: String!, $after: String) {
    viewer {
      login
      name
      avatarUrl
    }
    search(query: $query, type: ISSUE, first: ${PAGE_SIZE}, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on PullRequest {
          ${PULL_REQUEST_FIELDS}
        }
      }
    }
  }
`;

type GraphqlActor = {
  __typename?: string;
  login?: string;
  avatarUrl?: string;
  name?: string;
  combinedSlug?: string;
};

type GraphqlPullRequest = {
  id: string;
  number: number;
  title: string;
  body: string | null;
  url: string;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  mergedAt: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  headRefName: string;
  baseRefName: string;
  mergeStateStatus: PullRequest["mergeStateStatus"];
  reviewDecision: ReviewDecision;
  author?: { login: string } | null;
  repository: {
    name: string;
    nameWithOwner: string;
    url: string;
    owner: { login: string; avatarUrl: string };
  };
  reviewRequests: {
    nodes: Array<{ requestedReviewer: GraphqlActor | null }>;
  };
  latestReviews: {
    nodes: Array<{
      state: string;
      author: GraphqlActor | null;
    }>;
  };
  latestOpinionatedReviews: {
    nodes: Array<{
      state: string;
      author: GraphqlActor | null;
    }>;
  };
  commits: {
    nodes: Array<{
      commit: {
        oid: string;
      };
    }>;
  };
};

type GraphqlResponse = {
  data?: {
    viewer: Viewer;
    search: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<GraphqlPullRequest | null>;
    };
  };
  errors?: Array<{ message: string }>;
};

export class MissingGithubTokenError extends Error {
  constructor() {
    super("GitHub token is not set");
    this.name = "MissingGithubTokenError";
  }
}

export async function fetchGithubPullRequests(
  token: string,
  scope: PrScope,
): Promise<{
  viewer: Viewer;
  pullRequests: PullRequest[];
}> {
  return searchPullRequests(token, scope, OPEN_AUTHORED_SEARCH);
}

export async function fetchGithubReviewRequestedPullRequests(
  token: string,
  scope: PrScope,
): Promise<{
  viewer: Viewer;
  pullRequests: PullRequest[];
}> {
  return searchPullRequests(token, scope, REVIEW_REQUESTED_SEARCH);
}

/**
 * Merged PRs mentioned in the open PRs' descriptions (stack tables, related
 * PRs), so a linked group still shows the parts that already landed. Mentions
 * that are issues, closed PRs or out of scope are dropped.
 */
export async function fetchLinkedMergedPullRequests(
  token: string,
  scope: PrScope,
  openPullRequests: PullRequest[],
): Promise<PullRequest[]> {
  const known = new Set(
    openPullRequests.map((pr) => `${pr.repository.nameWithOwner}#${pr.number}`),
  );
  const refs: Array<{ owner: string; name: string; number: number }> = [];
  for (const pr of openPullRequests) {
    for (const ref of extractPullRequestMentions(
      pr.body,
      pr.repository.nameWithOwner,
    )) {
      const key = `${ref.nameWithOwner}#${ref.number}`;
      if (known.has(key) || !repoInScope(ref.nameWithOwner, scope)) continue;
      const [owner, name] = ref.nameWithOwner.split("/", 2);
      if (!owner || !name) continue;
      known.add(key);
      refs.push({ owner, name, number: ref.number });
    }
  }
  if (refs.length === 0) return [];

  const merged: PullRequest[] = [];
  const lookups = refs.slice(0, MAX_LINKED_LOOKUPS);
  for (let start = 0; start < lookups.length; start += LINKED_LOOKUPS_PER_QUERY) {
    const batch = lookups.slice(start, start + LINKED_LOOKUPS_PER_QUERY);
    const nodes = await githubLookupPullRequests(token, batch);
    for (const node of nodes) {
      if (node.state !== "MERGED") continue;
      merged.push({
        ...mapPullRequest(node),
        status: "merged",
        mergeStateStatus: null,
      });
    }
  }

  await adjustPullRequestsLineStats(token, merged);
  return merged;
}

async function searchPullRequests(
  token: string,
  scope: PrScope,
  searchQuery: string,
): Promise<{
  viewer: Viewer;
  pullRequests: PullRequest[];
}> {
  const pullRequests: PullRequest[] = [];
  let after: string | null = null;
  let viewer: Viewer | null = null;
  let pages = 0;

  do {
    const payload = await githubGraphql(token, searchQuery, after);
    viewer = payload.viewer;

    for (const node of payload.search.nodes) {
      if (!node || node.isDraft) continue;
      if (!repoInScope(node.repository.nameWithOwner, scope)) continue;
      pullRequests.push(mapPullRequest(node));
    }

    const page = payload.search.pageInfo;
    after = page.hasNextPage ? page.endCursor : null;
    pages += 1;
  } while (after && pullRequests.length < MAX_PRS && pages < MAX_SEARCH_PAGES);

  if (!viewer) {
    throw new Error("GitHub viewer was not returned");
  }

  await adjustPullRequestsLineStats(token, pullRequests);

  return { viewer, pullRequests };
}

async function githubGraphql(
  token: string,
  searchQuery: string,
  after: string | null,
) {
  const response = await fetch(GITHUB_GRAPHQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(typeof window === "undefined" ? { "User-Agent": "pr-dashboard" } : {}),
    },
    body: JSON.stringify({
      query: OPEN_PULL_REQUESTS_QUERY,
      variables: { query: searchQuery, after },
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL request failed (${response.status})`);
  }

  const json = (await response.json()) as GraphqlResponse;
  if (json.errors?.length) {
    throw new Error(json.errors.map((error) => error.message).join("; "));
  }
  if (!json.data) {
    throw new Error("GitHub GraphQL returned no data");
  }
  return json.data;
}

/**
 * Looks up PRs by repo and number in one aliased query. A mention can point at
 * an issue or a deleted repo; GitHub answers those with an error next to the
 * data, so errors are ignored and missing nodes skipped.
 */
async function githubLookupPullRequests(
  token: string,
  refs: Array<{ owner: string; name: string; number: number }>,
): Promise<GraphqlPullRequest[]> {
  const variableDefs: string[] = [];
  const fields: string[] = [];
  const variables: Record<string, string | number> = {};
  refs.forEach((ref, index) => {
    variableDefs.push(`$o${index}: String!, $n${index}: String!, $p${index}: Int!`);
    fields.push(
      `r${index}: repository(owner: $o${index}, name: $n${index}) { pullRequest(number: $p${index}) { ${PULL_REQUEST_FIELDS} } }`,
    );
    variables[`o${index}`] = ref.owner;
    variables[`n${index}`] = ref.name;
    variables[`p${index}`] = ref.number;
  });

  const response = await fetch(GITHUB_GRAPHQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      query: `query LinkedPullRequests(${variableDefs.join(", ")}) { ${fields.join("\n")} }`,
      variables,
    }),
  });
  if (!response.ok) {
    throw new Error(`GitHub GraphQL request failed (${response.status})`);
  }

  const json = (await response.json()) as {
    data?: Record<string, { pullRequest: GraphqlPullRequest | null } | null> | null;
  };
  return Object.values(json.data ?? {}).flatMap((repo) =>
    repo?.pullRequest ? [repo.pullRequest] : [],
  );
}

function mapPullRequest(node: GraphqlPullRequest): PullRequest {
  const requestedReviewers: Actor[] = [];
  const requestedTeams: TeamReviewer[] = [];

  for (const request of node.reviewRequests.nodes) {
    const reviewer = request.requestedReviewer;
    if (!reviewer) continue;
    if (reviewer.__typename === "Team" && reviewer.name) {
      requestedTeams.push({
        name: reviewer.name,
        slug: reviewer.combinedSlug ?? reviewer.name,
      });
      continue;
    }
    if (reviewer.login && !isBotActor(reviewer.login, reviewer.__typename)) {
      requestedReviewers.push({
        login: reviewer.login,
        avatarUrl: reviewer.avatarUrl ?? null,
        isBot: false,
      });
    }
  }

  // latestReviews drops a reviewer's changes-requested review once the author
  // re-requests them, while reviewDecision stays CHANGES_REQUESTED. Merge in
  // latestOpinionatedReviews so that review is still matched to the open request.
  const reviewedLogins = new Set(
    node.latestReviews.nodes.map((review) => review.author?.login),
  );
  const reviewNodes = [
    ...node.latestReviews.nodes,
    ...node.latestOpinionatedReviews.nodes.filter(
      (review) => !reviewedLogins.has(review.author?.login),
    ),
  ];
  const reviews = reviewNodes.flatMap((review) => {
    if (!review.author?.login) return [];
    return [
      {
        login: review.author.login,
        avatarUrl: review.author.avatarUrl ?? null,
        isBot: isBotActor(review.author.login, review.author.__typename),
        state: review.state,
      },
    ];
  });

  const authorLogin = node.author?.login ?? "";
  const mapped = {
    reviewDecision: node.reviewDecision,
    authorLogin,
    requestedReviewers,
    requestedTeams,
    reviews,
  };

  return {
    id: node.id,
    number: node.number,
    title: node.title,
    body: node.body ?? null,
    url: node.url,
    isDraft: node.isDraft,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    mergedAt: node.mergedAt ?? null,
    additions: node.additions,
    deletions: node.deletions,
    changedFiles: node.changedFiles,
    headRefName: node.headRefName,
    headRefOid: node.commits.nodes[0]?.commit.oid ?? null,
    baseRefName: node.baseRefName,
    mergeStateStatus: node.mergeStateStatus ?? null,
    checkStatus: null as CheckStatus,
    developmentSync: null,
    repository: {
      name: node.repository.name,
      nameWithOwner: node.repository.nameWithOwner,
      url: node.repository.url,
      ownerLogin: node.repository.owner.login,
      ownerAvatarUrl: node.repository.owner.avatarUrl,
    },
    requestedReviewers,
    requestedTeams,
    reviews,
    reviewDecision: node.reviewDecision,
    authorLogin,
    linkedGroupId: null,
    status: deriveReviewStatus(mapped),
    sessions: { review: false, triage: false },
    reviewStatus: {
      round: 0,
      sessionPath: null,
      clean: null,
      cleanExplicit: false,
      stale: null,
      reviewedShas: {},
      posted: false,
      openFindings: 0,
      openFindingReasons: [],
    },
  };
}
