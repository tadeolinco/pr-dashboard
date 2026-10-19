import type { PullRequest } from "@/lib/types";

export type PullRequestRef = {
  nameWithOwner: string;
  number: number;
};

function prRefKey(ref: PullRequestRef) {
  return `${ref.nameWithOwner}#${ref.number}`;
}

/** Pull request numbers mentioned in a GitHub PR description. */
export function extractPullRequestMentions(
  body: string | null | undefined,
  defaultNameWithOwner: string,
): PullRequestRef[] {
  if (!body?.trim()) return [];

  const seen = new Set<string>();
  const refs: PullRequestRef[] = [];

  function add(nameWithOwner: string, number: number) {
    if (!Number.isFinite(number) || number <= 0) return;
    const key = prRefKey({ nameWithOwner, number });
    if (seen.has(key)) return;
    seen.add(key);
    refs.push({ nameWithOwner, number });
  }

  for (const match of body.matchAll(
    /https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/gi,
  )) {
    add(`${match[1]}/${match[2]}`, Number.parseInt(match[3], 10));
  }

  // Shorthand refs only count in plain text: `[#12](…/security/dependabot/12)`
  // is an alert, and a PR link's target was already picked up above. Link
  // text may hold one level of brackets, as in `[[Area] title (#12)](…)`.
  const text = body
    .replace(/\[(?:[^[\]]|\[[^[\]]*\])*\]\([^)]*\)/g, " ")
    .replace(/https?:\/\/\S+/g, " ");

  for (const match of text.matchAll(
    /(?:^|[\s([{])((?:[\w.-]+\/)?[\w.-]+)#(\d+)\b/g,
  )) {
    const raw = match[1];
    const number = Number.parseInt(match[2], 10);
    if (raw.includes("/")) {
      add(raw, number);
    } else {
      const [owner, repo] = defaultNameWithOwner.split("/");
      if (owner && repo) add(`${owner}/${raw}`, number);
      else add(defaultNameWithOwner, number);
    }
  }

  // Bare `#12`; the `repo#12` / `owner/repo#12` forms were handled above.
  for (const match of text.matchAll(/(?<![\w./-])#(\d+)\b/g)) {
    add(defaultNameWithOwner, Number.parseInt(match[1], 10));
  }

  return refs;
}

/** Mutates pull requests with `linkedGroupId` (one id per solo PR or shared cluster). */
export function assignLinkedPullRequestGroups(pullRequests: PullRequest[]): void {
  const byKey = new Map<string, PullRequest>();
  for (const pr of pullRequests) {
    byKey.set(
      prRefKey({
        nameWithOwner: pr.repository.nameWithOwner,
        number: pr.number,
      }),
      pr,
    );
  }

  const parent = new Map<string, string>();

  function find(key: string): string {
    let root = key;
    while (parent.has(root)) {
      root = parent.get(root)!;
    }
    let cursor = key;
    while (cursor !== root) {
      const next = parent.get(cursor)!;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  }

  function union(a: string, b: string) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;
    const pick =
      rootA.localeCompare(rootB) <= 0 ? { keep: rootA, drop: rootB } : { keep: rootB, drop: rootA };
    parent.set(pick.drop, pick.keep);
  }

  for (const pr of pullRequests) {
    const from = prRefKey({
      nameWithOwner: pr.repository.nameWithOwner,
      number: pr.number,
    });
    const mentions = extractPullRequestMentions(
      pr.body,
      pr.repository.nameWithOwner,
    );
    for (const ref of mentions) {
      const to = prRefKey(ref);
      if (to !== from && byKey.has(to)) union(from, to);
    }
  }

  for (const pr of pullRequests) {
    const key = prRefKey({
      nameWithOwner: pr.repository.nameWithOwner,
      number: pr.number,
    });
    pr.linkedGroupId = find(key);
  }
}

export function linkedGroupSize(
  pullRequests: PullRequest[],
  groupId: string,
): number {
  let size = 0;
  for (const pr of pullRequests) {
    if (pr.linkedGroupId === groupId) size += 1;
  }
  return size;
}

/** PRs that belong to a mention cluster of two or more open PRs. */
export function countMultiLinkedPullRequests(pullRequests: PullRequest[]): number {
  const sizes = new Map<string, number>();
  for (const pr of pullRequests) {
    if (!pr.linkedGroupId) continue;
    sizes.set(
      pr.linkedGroupId,
      (sizes.get(pr.linkedGroupId) ?? 0) + 1,
    );
  }
  let count = 0;
  for (const pr of pullRequests) {
    if (!pr.linkedGroupId) continue;
    if ((sizes.get(pr.linkedGroupId) ?? 0) >= 2) count += 1;
  }
  return count;
}

export function linkedGroupMembers(
  pullRequests: PullRequest[],
  groupId: string,
): PullRequest[] {
  return pullRequests.filter((pr) => pr.linkedGroupId === groupId);
}
