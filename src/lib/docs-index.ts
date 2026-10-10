import { basename, createDocsFs, joinPath, type DocsFs } from "@/lib/host-fs";
import { prLookupKeys } from "@/lib/pr-keys";
import { aliasPattern, repoKey, repoKeyFromToken } from "@/lib/repo-settings";
import {
    parseSessionMarkdown,
    sessionNumberFromFilename,
    shaMatchesReviewed,
} from "@/lib/review-session/parse";
import type { ParsedSessionFile, PrReviewStatus } from "@/lib/review-session/types";
import type { PullRequest } from "@/lib/types";

const SESSION_FILE = /^(.+)-(\d+)\.md$/;
const SESSION_FILE_PREFIX = /^(.+)-\d+/;
/** PR links in session text; group 1 is the repo name (owner is ignored). */
const PULL_URL = /https:\/\/github\.com\/[^/\s]+\/([^/\s]+)\/pull\/(\d+)/g;

export type DocsIndexData = {
  reviewSessions: Record<string, ParsedSessionFile>;
  reviewPresence: string[];
  triagePresence: string[];
};

export async function buildDocsIndex(
  docsRoot: FileSystemDirectoryHandle,
): Promise<DocsIndexData> {
  const fs = createDocsFs(docsRoot);
  const reviewSessions = new Map<string, ParsedSessionFile>();
  const reviewPresence = new Set<string>();
  const triagePresence = await indexTriagePresence(fs);

  const prsRoot = "prs";
  if (await fs.pathExists(prsRoot)) {
    for (const repo of await listDirs(fs, prsRoot)) {
      if (repo === "pairs") {
        await indexPairArea(fs, joinPath(prsRoot, repo), reviewSessions, reviewPresence);
        continue;
      }
      for (const folder of await listDirs(fs, joinPath(prsRoot, repo))) {
        const dir = joinPath(prsRoot, repo, folder);
        const key = repoKeyFromToken(repo);
        if (await hasSessionMarkdown(fs, dir, folder)) {
          for (const sessionKey of sessionKeysForFolder(key, folder)) {
            reviewPresence.add(sessionKey);
          }
        }
        await indexFolderSessions(fs, dir, key, folder, reviewSessions, reviewPresence);
      }
    }
  }

  return {
    reviewSessions: Object.fromEntries(reviewSessions),
    reviewPresence: [...reviewPresence],
    triagePresence: [...triagePresence],
  };
}

export function enrichPullRequestsWithDocs(
  pullRequests: PullRequest[],
  index: DocsIndexData,
) {
  const reviewSessions = new Map(Object.entries(index.reviewSessions));
  const reviewPresence = new Set(index.reviewPresence);
  const triagePresence = new Set(index.triagePresence);

  for (const pr of pullRequests) {
    const keys = prLookupKeys(pr);
    pr.sessions = {
      review: keys.some((key) => reviewPresence.has(key)),
      triage: keys.some((key) => triagePresence.has(key)),
    };
    pr.reviewStatus = reviewStatusForPullRequest(pr, reviewSessions, keys);
  }
}

export function reviewStatusForPullRequest(
  pr: PullRequest,
  reviewSessions: Map<string, ParsedSessionFile>,
  keys = prLookupKeys(pr),
): PrReviewStatus {
  const empty: PrReviewStatus = {
    round: 0,
    sessionPath: null,
    clean: null,
    cleanExplicit: false,
    stale: null,
    reviewedShas: {},
    posted: false,
    openFindings: 0,
    openFindingReasons: [],
  };

  if (keys.length === 0) return empty;

  const code = keys[0].split(":")[0];
  let latest: ParsedSessionFile | null = null;
  for (const key of keys) {
    const session = reviewSessions.get(key);
    if (!session) continue;
    if (
      !latest ||
      session.sessionNum > latest.sessionNum ||
      (session.sessionNum === latest.sessionNum &&
        session.path.localeCompare(latest.path) > 0)
    ) {
      latest = session;
    }
  }

  if (!latest) return empty;

  const reviewedSha =
    latest.reviewed[code] ?? latest.reviewed.default ?? undefined;
  const headMatches = shaMatchesReviewed(
    pr.headRefOid ?? undefined,
    reviewedSha,
  );
  let stale: boolean | null = null;
  if (reviewedSha && pr.headRefOid) {
    stale = headMatches === false || latest.reviewedDirty;
  } else if (latest.reviewedDirty) {
    stale = true;
  }

  return {
    round: latest.sessionNum,
    sessionPath: latest.path,
    clean: latest.clean,
    cleanExplicit: latest.cleanExplicit,
    stale,
    reviewedShas: latest.reviewed,
    posted: latest.posted,
    openFindings: latest.openFindingCount,
    openFindingReasons: latest.openFindingReasons,
  };
}

async function indexTriagePresence(fs: DocsFs) {
  const keys = new Set<string>();
  const root = "triage";
  if (!(await fs.pathExists(root))) return keys;

  for (const repo of await listDirs(fs, root)) {
    if (repo === "pairs") {
      await indexPairPresenceOnly(fs, joinPath(root, repo), keys);
      continue;
    }
    for (const folder of await listDirs(fs, joinPath(root, repo))) {
      if (!(await hasSessionMarkdown(fs, joinPath(root, repo, folder), folder))) {
        continue;
      }
      for (const key of sessionKeysForFolder(repoKeyFromToken(repo), folder)) {
        keys.add(key);
      }
    }
  }

  return keys;
}

async function indexFolderSessions(
  fs: DocsFs,
  dir: string,
  repo: string,
  folderKey: string,
  reviewSessions: Map<string, ParsedSessionFile>,
  reviewPresence: Set<string>,
) {
  for (const file of await listMarkdown(fs, dir)) {
    const match = file.match(SESSION_FILE);
    if (!match || match[1] !== folderKey) continue;
    const sessionNum = Number(match[2]);
    const keys = sessionKeysForFolder(repo, folderKey);
    for (const key of keys) reviewPresence.add(key);
    registerSession(
      reviewSessions,
      await readSession(fs, joinPath(dir, file), sessionNum),
      keys,
    );
  }
}

async function indexPairArea(
  fs: DocsFs,
  pairsRoot: string,
  reviewSessions: Map<string, ParsedSessionFile>,
  reviewPresence: Set<string>,
) {
  for (const folder of await listDirs(fs, pairsRoot)) {
    const dir = joinPath(pairsRoot, folder);
    await indexPairPresenceOnly(fs, dir, reviewPresence, folder);

    for (const file of await listMarkdown(fs, dir)) {
      const fullPath = joinPath(dir, file);
      const content = await fs.readTextFile(fullPath);
      const sessionNum = sessionNumberFromFilename(file) || 1;
      const keys = pairKeysForSession(folder, content);
      for (const key of keys) reviewPresence.add(key);
      registerSession(
        reviewSessions,
        parseSessionMarkdown(fullPath, content, sessionNum),
        keys,
      );
    }
  }
}

async function indexPairPresenceOnly(
  fs: DocsFs,
  dir: string,
  keys: Set<string>,
  folderName?: string,
) {
  const folder = folderName ?? basename(dir);
  for (const key of folderRefKeys(folder)) keys.add(key);

  for (const file of await listMarkdown(fs, dir)) {
    const text = (await fs.readTextFile(joinPath(dir, file))).slice(0, 8000);
    for (const key of textRefKeys(text)) keys.add(key);
  }
}

function pairKeysForSession(folder: string, content: string) {
  return [...new Set([...folderRefKeys(folder), ...textRefKeys(content)])];
}

/** `FE-3320-BE-7739` style pair folder names. */
function folderRefKeys(folder: string) {
  const codes = aliasPattern();
  if (!codes) return [];
  return [...folder.matchAll(new RegExp(`(${codes})-(\\d+)`, "g"))].map(
    (match) => `${repoKeyFromToken(match[1])}:num:${match[2]}`,
  );
}

/** PR URLs and `FE 3320` style mentions in session text. */
function textRefKeys(text: string) {
  const keys: string[] = [];
  for (const match of text.matchAll(PULL_URL)) {
    keys.push(`${repoKey(match[1])}:num:${match[2]}`);
  }
  const codes = aliasPattern();
  if (codes) {
    for (const match of text.matchAll(
      new RegExp(`\\b(${codes})\\s+(\\d+)\\b`, "g"),
    )) {
      keys.push(`${repoKeyFromToken(match[1])}:num:${match[2]}`);
    }
  }
  return keys;
}

function sessionKeysForFolder(repo: string, folder: string) {
  if (/^\d+$/.test(folder)) {
    return [`${repo}:num:${folder}`];
  }
  return [`${repo}:slug:${folder}`];
}

async function readSession(
  fs: DocsFs,
  fullPath: string,
  sessionNum: number,
): Promise<ParsedSessionFile> {
  const content = await fs.readTextFile(fullPath);
  return parseSessionMarkdown(fullPath, content, sessionNum);
}

function registerSession(
  best: Map<string, ParsedSessionFile>,
  session: ParsedSessionFile,
  keys: string[],
) {
  for (const key of keys) {
    const existing = best.get(key);
    if (
      !existing ||
      session.sessionNum > existing.sessionNum ||
      (session.sessionNum === existing.sessionNum &&
        session.path.localeCompare(existing.path) > 0)
    ) {
      best.set(key, session);
    }
  }
}

async function hasSessionMarkdown(fs: DocsFs, dir: string, key: string) {
  const names = await listMarkdown(fs, dir);
  return names.some((name) => {
    const match = name.match(SESSION_FILE_PREFIX);
    return match?.[1] === key;
  });
}

async function listDirs(fs: DocsFs, dir: string) {
  try {
    if (!(await fs.pathExists(dir))) return [];
    const entries = await fs.readDir(dir);
    return entries
      .filter((entry) => entry.isDirectory && !entry.name.startsWith("."))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function listMarkdown(fs: DocsFs, dir: string) {
  try {
    if (!(await fs.pathExists(dir))) return [];
    const entries = await fs.readDir(dir);
    return entries
      .filter((entry) => entry.name.endsWith(".md"))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}
