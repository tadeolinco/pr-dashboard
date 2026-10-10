import { parseStoredBotLogins, setBotLogins } from "@/lib/bots";
import { forgetDocsFolder } from "@/lib/docs-folder";
import {
  parseRepoSettings,
  setRepoSettings,
  type RepoSettings,
} from "@/lib/repo-settings";
import { EMPTY_SCOPE, parseScope, type PrScope } from "@/lib/scope";

const STORAGE_KEY = "pr-dashboard.preferences";
/** Key used before the rename; read once and moved to STORAGE_KEY. */
const LEGACY_STORAGE_KEY = "review-helper.preferences";

export type AppPreferences = {
  githubToken: string;
  /** Read a local docs folder for Review / Clean / Stale / Triage columns. */
  localDocsIntegration: boolean;
  /** Orgs and repos whose PRs the dashboard shows. */
  scope: PrScope;
  /** Aliases and diff exclusions per repo. */
  repoSettings: RepoSettings[];
  /** Bot accounts; null means the built-in default list. */
  botLogins: string[] | null;
};

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  githubToken: "",
  localDocsIntegration: false,
  scope: EMPTY_SCOPE,
  repoSettings: [],
  botLogins: null,
};

export function readAppPreferences(): AppPreferences {
  const preferences = parseStoredPreferences();
  setRepoSettings(preferences.repoSettings);
  setBotLogins(preferences.botLogins);
  return preferences;
}

function parseStoredPreferences(): AppPreferences {
  if (typeof localStorage === "undefined") {
    return { ...DEFAULT_APP_PREFERENCES };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? migrateLegacyPreferences();
    if (!raw) return { ...DEFAULT_APP_PREFERENCES };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      githubToken:
        typeof parsed.githubToken === "string" ? parsed.githubToken : "",
      localDocsIntegration: parsed.localDocsIntegration === true,
      scope: parseScope(parsed.scope),
      repoSettings: parseRepoSettings(parsed.repoSettings ?? parsed.repoAliases),
      botLogins: parseStoredBotLogins(parsed.botLogins),
    };
  } catch {
    return { ...DEFAULT_APP_PREFERENCES };
  }
}

export function writeAppPreferences(update: Partial<AppPreferences>): AppPreferences {
  const next = { ...readAppPreferences(), ...update };
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  setRepoSettings(next.repoSettings);
  setBotLogins(next.botLogins);
  return next;
}

export function githubTokenFromPreferences(): string | null {
  const token = readAppPreferences().githubToken.trim();
  return token || null;
}

/** Removes the token, settings, caches and the saved docs folder from this browser. */
export async function clearLocalData() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("pr-dashboard.") || key === LEGACY_STORAGE_KEY) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage blocked: nothing stored either.
  }
  await forgetDocsFolder();
}

function migrateLegacyPreferences(): string | null {
  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacy === null) return null;
  localStorage.setItem(STORAGE_KEY, legacy);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  return legacy;
}
