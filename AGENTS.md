# PR dashboard

Dashboard for your GitHub pull requests across the orgs and repos you pick after adding a token (`PrScope` in `src/lib/scope.ts`, picker in `src/components/scope-picker.tsx`). **Next.js 16** app that runs entirely client-side and is meant to be **deployable**: anyone can open it, so treat it as a public web app. Dev server runs on port **4100**.

## What it does

- **My PRs**: table of your open PRs in the selected orgs/repos with repo badges, GitHub review status (bot reviews are ignored when deciding if a human reviewer is still needed), CI check rollup, behind/integrated status, and filters by repo / status / local session health. With the Show merged chip on (`?merged=true`, off by default), merged PRs mentioned in your open PRs' descriptions show with a Merged status, inside their group when Group linked is on (`fetchLinkedMergedPullRequests` in `src/lib/github.ts`); they never show on their own or count toward the status chips.
- **Pending reviews**: scan of one selected organization's open PRs with outstanding review requests, with stack-aware logic so only PRs reaching each repo's target branch (directly or through a stack) count (see `src/lib/pending-reviews/`). The tally is cached in localStorage.
- **Dates**: show relative times with `RelativeTime` (local date on hover) and absolute ones with `formatLocalDateTime`; never print UTC.
- **Local docs integration** (Settings toggle, off by default; the toggle only renders with `?advanced=true`, which `dashboardHref` carries through navigation and which never changes the saved on/off value): reads review session markdown from a folder the user picks with the File System Access API (Chromium only, read-only). Folder layout and session format are documented in the README ("Local docs integration"); keep that section in sync with `src/lib/docs-index.ts` and `src/lib/review-session/`.

## Run locally

```bash
npm install
npm run dev   # http://localhost:4100, paste a GitHub token in Settings
```

## Architecture (short)

| Area | Location |
|------|----------|
| Next shell | `src/app/` (`page.tsx` renders `client-app.tsx`, which loads `App` with `ssr: false`) |
| App + data load | `src/App.tsx`, `src/lib/dashboard-data.ts`, `src/lib/config.ts` |
| GitHub GraphQL/REST (called from the browser) | `src/lib/github.ts`, `src/lib/github-checks.ts`, `src/lib/github-graphql.ts` |
| Docs folder (handle in IndexedDB, permissions) | `src/lib/docs-folder.ts`, `src/lib/host-fs.ts` |
| Docs index + session parse | `src/lib/docs-index.ts`, `src/lib/review-session/` |
| Pending reviews | `src/lib/pending-reviews/` |
| Security headers / CSP | `next.config.ts`, `src/proxy.ts` |
| UI | `src/components/` (shadcn / Radix) |

**Refresh** calls `invalidateDashboardCaches()` and reloads dashboard data in the client.

## Security rules (it gets deployed)

- **No server-held secrets.** Never read `GITHUB_TOKEN` (or any token) from env in app code, and do not add API routes or server actions that call GitHub on someone's behalf. The token is the user's own, in their localStorage, sent only to `api.github.com` (REST calls go through `githubFetchWithRetry`, which refuses any other origin). Settings → Clear data wipes it.
- **Keep the CSP tight.** `src/proxy.ts` sets a nonce-based `script-src` and limits `connect-src` / `img-src` to GitHub. Add a host there only when a feature needs it. No `dangerouslySetInnerHTML`, no inline `<script>`, no `eval`.
- **Links from data** come from the GitHub API (`pr.url`, review URLs). Do not turn session-file text into links or HTML without checking the scheme is `https:`.
- **Session front matter is YAML only** (`yaml` package via `splitSessionMarkdown`). Do not bring back gray-matter or anything that evaluates `---js` blocks.
- **Docs folder stays read-only.** Request `{ mode: "read" }` only; anything the app needs to persist goes to localStorage / IndexedDB, not the user's folder.
- Docs features must degrade quietly when the toggle is off or the browser lacks `showDirectoryPicker` (most users have no docs folder).

## When changing behavior

- Repo settings (aliases for badges and docs folder / session-text codes; target branch, default the repo's GitHub default branch; integration branch for the Integrated column, default `development`; badge colour (`src/lib/repo-colors.ts` hands out non-repeating palette defaults); glob lists of files excluded from diff counts): `src/lib/repo-settings.ts`, `src/lib/glob.ts`, `src/lib/diff-exclusions.ts`, edited on the Repo settings page (`src/components/repo-settings-page.tsx`). Docs lookup keys are the lowercased repo name; never hardcode org or repo names in source.
- Org / repo selection: `src/lib/scope.ts`. Searches run across everything the token sees and are narrowed with `repoInScope`; Pending reviews runs per selected organization.
- New PR columns or filters: extend `src/lib/types.ts`, enrichment in `docs-index` / `dashboard-data`, then table components.
- Shared setup links: `src/lib/setup-link.ts` (`?setup=` = base64url JSON of scope, repo settings and bot list; never the token or docs toggle). Read once and stripped from the URL on load; applied automatically when the browser has no settings, otherwise `SetupLinkBanner` asks. Treat link contents as untrusted and run them through the same parsers as saved preferences.
- Bot accounts: `src/lib/bots.ts` (`DEFAULT_BOT_LOGINS`, editable on the Bot accounts page; null in preferences means defaults).
- Pending-review stacking rules: `src/lib/pending-reviews/stack.ts` and `fetch.ts`.

Human-oriented setup notes live in `README.md`.
