import { globToRegExp } from "@/lib/glob";

/**
 * Per-repo settings from the Repo settings page. The first alias is the badge
 * label; every alias also resolves to the repo in docs folder names and
 * session text (e.g. `docs/prs/agents/…`, `Reviewed: FE abc1234`).
 */
export type RepoSettings = {
  /** Repo name, optionally `owner/name`. Matched by name, case-insensitively. */
  repo: string;
  names: string[];
  // Globs for files left out of diff counts, e.g. "**/translations.*.json".
  ignoredPaths: string[];
  /** Branch PRs ultimately merge into; the repo's GitHub default branch when unset. */
  targetBranch?: string;
  /** Branch commits land on before release; DEFAULT_INTEGRATION_BRANCH when unset. */
  integrationBranch?: string;
  /** Badge colour as #rrggbb; a palette colour is assigned when unset. */
  color?: string;
};

/** Only when GitHub reports no default branch (e.g. an empty repo). */
export const FALLBACK_TARGET_BRANCH = "main";
export const DEFAULT_INTEGRATION_BRANCH = "development";

export const ALIAS_NAME = /^[A-Za-z0-9._-]{1,24}$/;
const REPO = /^(?:[A-Za-z0-9-]{1,39}\/)?[A-Za-z0-9._-]{1,100}$/;

// Kept in sync by readAppPreferences / writeAppPreferences so badges, diff
// counts and docs parsing can look settings up without threading them through.
let current: RepoSettings[] = [];
let ignoredPatternCache = new Map<string, RegExp[]>();

let version = 0;

export function setRepoSettings(settings: RepoSettings[]) {
  current = settings;
  ignoredPatternCache = new Map();
  version += 1;
}

/** Bumps whenever settings change, so derived caches (badge colours) can reset. */
export function repoSettingsVersion() {
  return version;
}

/** Stable key for a repo in docs lookups: its lowercased name. */
export function repoKey(repositoryName: string) {
  return repositoryName.toLowerCase();
}

function repoNameOf(repo: string) {
  return repo.slice(repo.lastIndexOf("/") + 1).toLowerCase();
}

function settingsForRepo(repositoryName: string) {
  const name = repositoryName.toLowerCase();
  return current.find((entry) => repoNameOf(entry.repo) === name);
}

export function repoLabel(repositoryName: string): string {
  return settingsForRepo(repositoryName)?.names[0] ?? twoLetterRepoLabel(repositoryName);
}

/** Compiled ignored-path globs for a repo (empty when none are set). */
export function ignoredPathPatterns(repositoryName: string): RegExp[] {
  const key = repositoryName.toLowerCase();
  let patterns = ignoredPatternCache.get(key);
  if (!patterns) {
    patterns = (settingsForRepo(repositoryName)?.ignoredPaths ?? []).map(globToRegExp);
    ignoredPatternCache.set(key, patterns);
  }
  return patterns;
}

/** Docs folder name or session-text code → repo key (falls back to the token itself). */
export function repoKeyFromToken(token: string): string {
  const lower = token.toLowerCase();
  const match = current.find((entry) =>
    entry.names.some((name) => name.toLowerCase() === lower),
  );
  return match ? repoNameOf(match.repo) : lower;
}

/** Regex alternation of every alias name, longest first; null when none are set. */
export function aliasPattern(): string | null {
  const names = current
    .flatMap((entry) => entry.names)
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return names.length > 0 ? names.join("|") : null;
}

export function branchSlug(headRefName: string) {
  return headRefName.replaceAll("/", "-");
}

/** Comma-separated input ("AG, agents") → validated names. */
export function parseAliasNames(input: string): string[] {
  return [
    ...new Set(
      input
        .split(",")
        .map((name) => name.trim())
        .filter((name) => ALIAS_NAME.test(name)),
    ),
  ];
}

/** Override for the branch Pending reviews / To review stacks must reach. */
export function targetBranchForRepository(repositoryName: string): string | null {
  return settingsForRepo(repositoryName)?.targetBranch ?? null;
}

/** Branch the Integrated column compares PR heads against. */
export function integrationBranchForRepository(repositoryName: string): string {
  return (
    settingsForRepo(repositoryName)?.integrationBranch ?? DEFAULT_INTEGRATION_BRANCH
  );
}

/** Colour picked on the Repo settings page, if any. */
export function colorForRepository(repositoryName: string): string | null {
  return settingsForRepo(repositoryName)?.color ?? null;
}

/** All explicitly picked colours, so palette defaults can avoid them. */
export function pickedRepoColors(): string[] {
  return current.flatMap((entry) => (entry.color ? [entry.color] : []));
}

const HEX_COLOR = /^#[0-9a-f]{6}$/;

export function parseColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const lower = value.trim().toLowerCase();
  return HEX_COLOR.test(lower) ? lower : undefined;
}

const BRANCH = /^(?!.*\.\.)(?!\/)(?!.*\/$)[A-Za-z0-9._\/-]{1,200}$/;

export function parseBranchName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return BRANCH.test(trimmed) ? trimmed : undefined;
}

export function isValidRepoName(repo: string) {
  return REPO.test(repo.trim());
}

const MAX_GLOB_LENGTH = 200;

/** One glob per line (or comma-separated) → trimmed, de-duplicated list. */
export function parseIgnoredPaths(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[\n,]/)
        .map((glob) => glob.trim())
        .filter((glob) => glob.length > 0 && glob.length <= MAX_GLOB_LENGTH),
    ),
  ];
}

const LEGACY_TRANSLATION_GLOB = "**/translations.*.json";

export function parseRepoSettings(value: unknown): RepoSettings[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): RepoSettings[] => {
    if (!raw || typeof raw !== "object") return [];
    const entry = raw as Record<string, unknown>;
    if (typeof entry.repo !== "string" || !isValidRepoName(entry.repo)) return [];
    const names = Array.isArray(entry.names)
      ? entry.names.filter(
          (name): name is string => typeof name === "string" && ALIAS_NAME.test(name),
        )
      : [];
    const ignoredPaths = Array.isArray(entry.ignoredPaths)
      ? parseIgnoredPaths(
          entry.ignoredPaths.filter((glob): glob is string => typeof glob === "string").join("\n"),
        )
      : // Earlier versions stored a single "skip translation JSON" flag.
        entry.skipTranslationDiffs === true
        ? [LEGACY_TRANSLATION_GLOB]
        : [];
    const targetBranch = parseBranchName(entry.targetBranch);
    const integrationBranch = parseBranchName(entry.integrationBranch);
    const color = parseColor(entry.color);
    if (
      names.length === 0 &&
      ignoredPaths.length === 0 &&
      !targetBranch &&
      !integrationBranch &&
      !color
    ) {
      return [];
    }
    return [
      {
        repo: entry.repo.trim(),
        names,
        ignoredPaths,
        ...(targetBranch ? { targetBranch } : {}),
        ...(integrationBranch ? { integrationBranch } : {}),
        ...(color ? { color } : {}),
      },
    ];
  });
}

/** Stable two-letter badge when the repo has no alias. */
export function twoLetterRepoLabel(repositoryName: string): string {
  const parts = repositoryName.split(/[-_.]+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0]!;
    const last = parts[parts.length - 1]!;
    return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
  }
  const word = parts[0] ?? repositoryName;
  return word.slice(0, 2).toUpperCase();
}
