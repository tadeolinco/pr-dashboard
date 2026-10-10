import type { CheckStatus } from "@/lib/types";

const GITHUB_GRAPHQL = "https://api.github.com/graphql";
const BATCH_SIZE = 25;

type GraphqlCheckNode = {
  id?: string;
  commits?: {
    nodes: Array<{
      commit: {
        statusCheckRollup: { state: CheckStatus } | null;
      };
    }>;
  };
};

export async function fetchCheckStatuses(
  token: string,
  pullRequestIds: string[],
): Promise<Record<string, CheckStatus>> {
  const uniqueIds = [...new Set(pullRequestIds)].filter(Boolean);
  const result: Record<string, CheckStatus> = {};

  for (let offset = 0; offset < uniqueIds.length; offset += BATCH_SIZE) {
    const batch = uniqueIds.slice(offset, offset + BATCH_SIZE);
    const chunk = await fetchCheckStatusBatch(token, batch);
    Object.assign(result, chunk);
  }

  return result;
}

async function fetchCheckStatusBatch(token: string, ids: string[]) {
  const variables: Record<string, string> = {};
  const fields = ids
    .map((id, index) => {
      const name = `id${index}`;
      variables[name] = id;
      return `p${index}: node(id: $${name}) {
        ... on PullRequest {
          id
          commits(last: 1) {
            nodes {
              commit {
                statusCheckRollup {
                  state
                }
              }
            }
          }
        }
      }`;
    })
    .join("\n");

  const variableDefs = ids.map((_, index) => `$id${index}: ID!`).join(", ");
  const query = `query CheckStatuses(${variableDefs}) { ${fields} }`;

  const response = await fetch(GITHUB_GRAPHQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(typeof window === "undefined" ? { "User-Agent": "pr-dashboard" } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GitHub check status request failed (${response.status})`);
  }

  const json = (await response.json()) as {
    data?: Record<string, GraphqlCheckNode | null>;
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new Error(json.errors.map((error) => error.message).join("; "));
  }

  const statuses: Record<string, CheckStatus> = {};
  for (const node of Object.values(json.data ?? {})) {
    if (!node?.id) continue;
    statuses[node.id] =
      node.commits?.nodes[0]?.commit.statusCheckRollup?.state ?? null;
  }
  return statuses;
}
