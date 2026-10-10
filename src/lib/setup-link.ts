import { parseStoredBotLogins } from "@/lib/bots";
import { parseRepoSettings, type RepoSettings } from "@/lib/repo-settings";
import { parseScope, type PrScope } from "@/lib/scope";

/**
 * Shareable settings in a `?setup=` link, so a coworker starts with the same
 * orgs, repo settings and bot list. Never carries the token or docs toggle.
 * Links are untrusted input: everything goes through the same parsers as
 * saved preferences.
 */
export type SharedSetup = {
  scope: PrScope;
  repoSettings: RepoSettings[];
  /** null means the built-in default bot list. */
  botLogins: string[] | null;
};

const PARAM = "setup";
const VERSION = 1;
const MAX_ENCODED_LENGTH = 16_000;
const SUGGESTED_SCOPE_KEY = "pr-dashboard.suggested-scope";

export function setupLinkFor(setup: SharedSetup): string {
  const payload = {
    v: VERSION,
    // Avatars are re-fetched from GitHub; links only carry logins and repos.
    scope: {
      owners: setup.scope.owners.map(({ login, type, repos }) => ({ login, type, repos })),
    },
    repoSettings: setup.repoSettings,
    botLogins: setup.botLogins,
  };
  const url = new URL("/", window.location.origin);
  url.searchParams.set(PARAM, toBase64Url(JSON.stringify(payload)));
  return url.toString();
}

/**
 * Reads and removes `?setup=` from the address bar so it isn't re-applied on
 * reload or copied along with filter links. "invalid" when present but unusable.
 */
let consumed: SharedSetup | "invalid" | null | undefined;

export function consumeSetupParam(): SharedSetup | "invalid" | null {
  // Cached: React dev mode runs state initialisers twice, and the first call
  // already removed the param.
  if (consumed === undefined) consumed = readAndStripSetupParam();
  return consumed;
}

function readAndStripSetupParam(): SharedSetup | "invalid" | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const raw = url.searchParams.get(PARAM);
  if (raw === null) return null;
  url.searchParams.delete(PARAM);
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);

  if (raw.length > MAX_ENCODED_LENGTH) return "invalid";
  try {
    const parsed = JSON.parse(fromBase64Url(raw)) as Record<string, unknown>;
    if (parsed.v !== VERSION) return "invalid";
    return {
      scope: parseScope(parsed.scope),
      repoSettings: parseRepoSettings(parsed.repoSettings),
      botLogins: parseStoredBotLogins(parsed.botLogins),
    };
  } catch {
    return "invalid";
  }
}

/** Orgs & repos from a link, pre-ticked in the picker until the user saves one. */
export function readSuggestedScope(): PrScope | null {
  try {
    const raw = sessionStorage.getItem(SUGGESTED_SCOPE_KEY);
    return raw ? parseScope(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeSuggestedScope(scope: PrScope | null) {
  try {
    if (scope && scope.owners.length > 0) {
      sessionStorage.setItem(SUGGESTED_SCOPE_KEY, JSON.stringify(scope));
    } else {
      sessionStorage.removeItem(SUGGESTED_SCOPE_KEY);
    }
  } catch {
    // Storage blocked: the picker just starts empty.
  }
}

function toBase64Url(text: string) {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded: string) {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}
