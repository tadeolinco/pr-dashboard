/** Which GitHub owners (orgs or users) and repos the dashboard covers. */
export type ScopeOwner = {
  login: string;
  type: "Organization" | "User";
  avatarUrl: string | null;
  /** Repo names (without owner). null means every repo the token can see. */
  repos: string[] | null;
};

export type PrScope = { owners: ScopeOwner[] };

export const EMPTY_SCOPE: PrScope = { owners: [] };

export function isScopeEmpty(scope: PrScope) {
  return scope.owners.length === 0;
}

export function repoInScope(nameWithOwner: string, scope: PrScope) {
  const [owner, name] = nameWithOwner.split("/", 2);
  const match = scope.owners.find(
    (entry) => entry.login.toLowerCase() === owner?.toLowerCase(),
  );
  if (!match) return false;
  if (match.repos === null) return true;
  return match.repos.some((repo) => repo.toLowerCase() === name?.toLowerCase());
}

export function scopeOrganizations(scope: PrScope) {
  return scope.owners.filter((owner) => owner.type === "Organization");
}

export function scopeKey(scope: PrScope) {
  return scope.owners
    .map((owner) => `${owner.login}:${owner.repos?.join(",") ?? "*"}`)
    .sort()
    .join("|");
}

export function parseScope(value: unknown): PrScope {
  if (!value || typeof value !== "object") return EMPTY_SCOPE;
  const owners = (value as { owners?: unknown }).owners;
  if (!Array.isArray(owners)) return EMPTY_SCOPE;
  return {
    owners: owners.flatMap((raw): ScopeOwner[] => {
      if (!raw || typeof raw !== "object") return [];
      const entry = raw as Record<string, unknown>;
      if (typeof entry.login !== "string" || !GITHUB_LOGIN.test(entry.login)) {
        return [];
      }
      const repos = Array.isArray(entry.repos)
        ? entry.repos.filter(
            (repo): repo is string =>
              typeof repo === "string" && GITHUB_REPO_NAME.test(repo),
          )
        : null;
      return [
        {
          login: entry.login,
          type: entry.type === "User" ? "User" : "Organization",
          avatarUrl:
            typeof entry.avatarUrl === "string" &&
            entry.avatarUrl.startsWith(GITHUB_AVATAR_PREFIX)
              ? entry.avatarUrl
              : null,
          repos,
        },
      ];
    }),
  };
}

const GITHUB_AVATAR_PREFIX = "https://avatars.githubusercontent.com/";

export const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
export const GITHUB_REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;
