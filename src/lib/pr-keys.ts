import { branchSlug, repoKey } from "@/lib/repo-settings";

export function prLookupKeys(pr: {
  repository: { name: string };
  headRefName: string;
  number: number;
}) {
  const code = repoKey(pr.repository.name);
  const slug = branchSlug(pr.headRefName);
  return [`${code}:slug:${slug}`, `${code}:num:${pr.number}`];
}
