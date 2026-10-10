import { githubGraphql } from "@/lib/github-graphql";
import type { ScopeOwner } from "@/lib/scope";

export type OwnerOption = Omit<ScopeOwner, "repos">;

type OwnerNode = {
  __typename: "Organization" | "User";
  login: string;
  avatarUrl: string | null;
};

const VIEWER_OWNERS_QUERY = `
query {
  viewer {
    __typename
    login
    avatarUrl
    organizations(first: 100) {
      nodes { __typename login avatarUrl }
    }
  }
}
`;

const OWNER_QUERY = `
query($login: String!) {
  repositoryOwner(login: $login) { __typename login avatarUrl }
}
`;

const OWNER_REPOS_QUERY = `
query($login: String!, $cursor: String) {
  repositoryOwner(login: $login) {
    repositories(
      first: 100
      after: $cursor
      isArchived: false
      orderBy: { field: PUSHED_AT, direction: DESC }
    ) {
      pageInfo { hasNextPage endCursor }
      nodes { name }
    }
  }
}
`;

const MAX_REPO_PAGES = 5;

/**
 * The viewer plus orgs GitHub lists for them. Private org memberships only
 * show when the token has read:org, so the picker also accepts a typed login.
 */
export async function fetchViewerOwners(token: string): Promise<OwnerOption[]> {
  const data = await githubGraphql<{
    viewer: OwnerNode & { organizations: { nodes: Array<OwnerNode | null> } };
  }>(token, VIEWER_OWNERS_QUERY, {});
  const { viewer } = data;
  return [
    toOption(viewer),
    ...viewer.organizations.nodes.flatMap((node) => (node ? [toOption(node)] : [])),
  ];
}

export async function fetchOwner(
  token: string,
  login: string,
): Promise<OwnerOption | null> {
  const data = await githubGraphql<{ repositoryOwner: OwnerNode | null }>(
    token,
    OWNER_QUERY,
    { login },
  );
  return data.repositoryOwner ? toOption(data.repositoryOwner) : null;
}

/** Repos the token can see under this owner, most recently pushed first. */
export async function fetchOwnerRepos(
  token: string,
  login: string,
): Promise<string[]> {
  const names: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_REPO_PAGES; page++) {
    const data: {
      repositoryOwner: {
        repositories: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<{ name: string } | null>;
        };
      } | null;
    } = await githubGraphql(token, OWNER_REPOS_QUERY, { login, cursor });
    const block = data.repositoryOwner?.repositories;
    if (!block) break;
    for (const node of block.nodes) if (node) names.push(node.name);
    if (!block.pageInfo.hasNextPage) break;
    cursor = block.pageInfo.endCursor;
  }
  return names;
}

function toOption(node: OwnerNode): OwnerOption {
  return {
    login: node.login,
    type: node.__typename === "Organization" ? "Organization" : "User",
    avatarUrl: node.avatarUrl,
  };
}
