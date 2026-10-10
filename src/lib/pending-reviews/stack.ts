export type StackOpenPr = {
  number: number;
  title: string;
  url: string;
  baseRef: string;
  headRef: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  lastCommitAt?: string;
  lastHumanReviewAt?: string;
  authorLogin?: string;
  authorAvatarUrl?: string | null;
  requestedLogins: Set<string>;
};

export type StackParent = {
  number: number;
  title: string;
  url: string;
};

export function selectPrsReachingBase(
  prs: StackOpenPr[],
  baseBranch: string,
): StackOpenPr[] {
  const included = new Set<number>();
  for (const pr of prs) {
    if (pr.baseRef === baseBranch) included.add(pr.number);
  }

  const byHead = new Map(prs.map((pr) => [pr.headRef, pr]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const pr of prs) {
      if (included.has(pr.number)) continue;
      const parent = byHead.get(pr.baseRef);
      if (parent && included.has(parent.number)) {
        included.add(pr.number);
        changed = true;
      }
    }
  }

  return prs.filter((pr) => included.has(pr.number));
}

export function stackParentFor(
  pr: StackOpenPr,
  inStack: StackOpenPr[],
  baseBranch: string,
): StackParent | null {
  if (pr.baseRef === baseBranch) return null;
  const byHead = new Map(inStack.map((other) => [other.headRef, other]));
  const parent = byHead.get(pr.baseRef);
  if (!parent) return null;
  return { number: parent.number, title: parent.title, url: parent.url };
}
