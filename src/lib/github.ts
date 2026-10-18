import { isBotActor } from "@/lib/bots";
import { adjustPullRequestsLineStats } from "@/lib/diff-exclusions";
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
