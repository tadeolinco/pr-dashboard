import {
    sortPullRequests,
    type PrSortState,
} from "@/lib/pr-table-sort";
import type { PullRequest } from "@/lib/types";

export type PrTableSegment =
  | { kind: "group-divider"; groupId: string }
  | { kind: "row"; pullRequest: PullRequest };

export function layoutPullRequestRows(
  pullRequests: PullRequest[],
  sort: PrSortState,
  groupLinked: boolean,
): PrTableSegment[] {
  const sorted = sortPullRequests(pullRequests, sort);
  if (!groupLinked) {
    return sorted.map((pullRequest) => ({ kind: "row", pullRequest }));
  }

  const emittedGroups = new Set<string>();
  const segments: PrTableSegment[] = [];

  for (const pr of sorted) {
    const groupId = pr.linkedGroupId;
    if (!groupId) {
      segments.push({ kind: "row", pullRequest: pr });
      continue;
    }
    if (emittedGroups.has(groupId)) continue;
    emittedGroups.add(groupId);
    const members = sorted.filter(
      (candidate) => candidate.linkedGroupId === groupId,
    );
    segments.push({ kind: "group-divider", groupId });
    for (const member of members) {
      segments.push({ kind: "row", pullRequest: member });
    }
  }

  return segments;
}
