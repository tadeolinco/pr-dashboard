# PR dashboard

A dense dashboard of your open GitHub pull requests: repo badges, review status (needs reviewer, review requested, approved, …), CI checks, whether each PR is behind its base or already on an integration branch, plus a team-wide tally of who has reviews waiting. Bot reviews are ignored when deciding whether a PR still needs a human reviewer.

It's a Next.js app that runs entirely in the browser. Each person pastes their own GitHub token in **Settings**; it stays in that browser and is only ever sent to `api.github.com`. The server holds no secrets.

## Run locally

```bash
npm install
npm run dev   # http://localhost:4100
```

Open **Settings**, paste a token with the `repo` scope (`gh auth token` works if you use the GitHub CLI), then pick which orgs and repos to show. Add `read:org` to the token if your private org memberships don't appear, or type the org name in.

## Settings

- **Orgs & repos**: whose pull requests to show; all repos of an owner or a hand-picked list.
- **Repo settings**, per repo:
  - **Aliases**: the badge label, plus extra names treated as the same repo.
  - **Badge colour**: picked, or a non-repeating palette default.
  - **Target branch**: the branch PRs ultimately merge into (default: the repo's GitHub default branch). Pending reviews and To review only count PRs aimed at it, directly or through a stack.
  - **Integration branch**: where work lands before release (default `development`). My PRs shows whether each PR's latest commit is already there.
  - **Not counted as review load**: base branches (e.g. `production`) whose PRs are left out of Pending reviews' 7-day review load, so approving release PRs doesn't count as reviewing.
  - **Excluded from diff counts**: globs such as `**/translations.*.json` or `*.lock`, left out of line and file totals.
- **Bot accounts**: logins whose reviews don't count as human reviews. Ships with a list of common review, CI and dependency bots; GitHub app accounts and `[bot]` / `-bot` / `_bot` logins always count.

Everything is stored in the browser's local storage. **Settings → Clear data** removes it all.

## Sharing your setup

**Settings → Share setup** copies a link carrying your orgs & repos, repo settings and bot list. It never includes your token. Someone who opens it with nothing configured gets those settings straight away and only has to paste their own token and confirm the pre-ticked orgs; anyone with existing settings is asked before anything is replaced.

## Deploying

Deploy as a normal Next.js app (for example on Vercel). Do **not** set `GITHUB_TOKEN` or any other secret in the deployment environment; the app never reads one.

Security headers live in [`next.config.ts`](next.config.ts), and the per-request Content-Security-Policy (script nonce, `connect-src` limited to GitHub) lives in [`src/proxy.ts`](src/proxy.ts). If you add a new external host (images, APIs), allow it there.

## Local docs integration (optional)

For people who keep PR review notes as markdown files on their machine. Open the app with `?advanced=true` to show the **Local docs integration** toggle in Settings (the parameter only shows the toggle; it never turns it on or off), turn it on and pick the folder. The browser gets read-only access through the File System Access API, so this needs Chrome, Edge or another Chromium browser. Browsers can drop the grant between visits; the header then shows **Reconnect docs folder**.

With it on, My PRs gains **Review**, **Clean**, **Stale** and **Triage** columns.

### Folder layout

```text
<docs folder>/
  prs/<repo>/<key>/<key>-<round>.md       review sessions for one PR
  prs/pairs/<name>/*.md                   one session covering several PRs
  triage/<repo>/<key>/<key>-<n>.md        triage notes for one PR
```

- `<repo>` is the repo name or any of its aliases from Repo settings.
- `<key>` is the PR's head branch with `/` replaced by `-`, or the PR number.
- A pairs session is linked to PRs through its folder name (`FE-3320-BE-7739`, using aliases), GitHub PR URLs in the text, and mentions like `FE 3320`.

### Session files

The latest round per PR wins. Front matter is the preferred way to describe it:

```markdown
---
review:
  round: 2
  clean: false
  dirty: false
  openFindings: 3
  reviewed:
    FE: 1a2b3c4
---
```

- `reviewed` maps a repo (name or alias) to the commit SHA that was reviewed. **Stale** shows when the PR's head has moved on, or when `dirty: true`.
- Without front matter, the dashboard falls back to a `Reviewed: FE 1a2b3c4 · BE 5d6e7f8` line, a `Session: 2` line, and a `<!-- pr-dashboard-status round: 2 clean: true -->` comment.
- Without an explicit `clean`, it counts open `###` items under finding sections (`## Possible bugs`, `## Contract`, `## Deficiencies`, `## Notes`, …).
- A `Posted: https://…` line marks the session as posted to GitHub.
