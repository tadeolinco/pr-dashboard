/**
 * Accounts treated as bots: their reviews never count as a human review, and
 * they're left out of Pending reviews. Users can edit the list in Settings;
 * GitHub's Bot account type and `[bot]` / `-bot` / `_bot` suffixes always count.
 */
export const DEFAULT_BOT_LOGINS = [
  // AI code review
  "copilot",
  "copilot-pull-request-reviewer",
  "copilot-swe-agent",
  "coderabbitai",
  "greptile-apps",
  "cursor",
  "claude",
  "chatgpt-codex-connector",
  "gemini-code-assist",
  "devin-ai-integration",
  "sourcery-ai",
  "qodo-merge-pro",
  "codiumai-pr-agent-pro",
  "ellipsis-dev",
  "korbit-ai",
  "bito-code-review",
  "baz-reviewer",
  "what-the-diff",
  "sweep-ai",
  "graphite-app",
  // Dependencies and automation
  "dependabot",
  "renovate",
  "github-actions",
  "mergify",
  "kodiakhq",
  "pre-commit-ci",
  "semantic-release-bot",
  "changeset-bot",
  "allcontributors",
  "imgbot",
  "restyled-io",
  "stale",
  "linear",
  // Quality, coverage and security
  "sonarcloud",
  "sonarqubecloud",
  "codecov",
  "codeclimate",
  "deepsource-io",
  "codspeed-hq",
  "socket-security",
  "gitguardian",
  "snyk-io",
  "sentry",
  // Deploy previews
  "vercel",
  "netlify",
  "cloudflare-workers-and-pages",
  "railway-app",
  "supabase",
];

const LOGIN = /^[A-Za-z0-9][A-Za-z0-9-_[\]]{0,49}$/;

// Kept in sync by readAppPreferences / writeAppPreferences.
let botLogins = new Set(DEFAULT_BOT_LOGINS);

/** null restores the defaults. */
export function setBotLogins(logins: string[] | null) {
  botLogins = new Set((logins ?? DEFAULT_BOT_LOGINS).map((login) => login.toLowerCase()));
}

export function isBotActor(login: string | undefined, typename?: string | null) {
  if (!login) return true;
  if (typename === "Bot") return true;
  const lower = login.toLowerCase();
  if (lower.endsWith("[bot]") || lower.endsWith("-bot") || lower.endsWith("_bot")) {
    return true;
  }
  return botLogins.has(lower);
}

/** One login per line (or comma-separated) → validated, de-duplicated list. */
export function parseBotLogins(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[\n,]/)
        .map((login) => login.trim().replace(/^@/, "").toLowerCase())
        .filter((login) => LOGIN.test(login)),
    ),
  ];
}

export function parseStoredBotLogins(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return parseBotLogins(
    value.filter((login): login is string => typeof login === "string").join("\n"),
  );
}
