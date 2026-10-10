import { aliasPattern, repoKeyFromToken } from "@/lib/repo-settings";
import {
    readReviewFrontmatter,
    splitSessionMarkdown,
} from "@/lib/review-session/frontmatter";
import type { ParsedSessionFile, ReviewedShaMap } from "@/lib/review-session/types";

/** `<!-- pr-dashboard-status … -->`; the older `review-helper-status` marker still reads. */
const FOOTER_RE =
  /<!--\s*(?:pr-dashboard|review-helper)-status\s*([\s\S]*?)-->/i;

const REVIEWED_LINE =
  /^Reviewed:\s*(.+)$/im;

const SESSION_LINE = /^Session:\s*(\d+)/im;

const POSTED_LINE = /^Posted:\s*https?:\/\//im;

export function parseSessionMarkdown(
  path: string,
  content: string,
  sessionNumFromName: number,
): ParsedSessionFile {
  const { data, content: body } = splitSessionMarkdown(content);
  const frontmatter = readReviewFrontmatter(data);

  const footer = parseFooter(body);
  const reviewedFromLine = parseReviewedLine(body);
  const reviewed = canonicalReviewedKeys(
    Object.keys(frontmatter?.reviewed ?? {}).length > 0
      ? (frontmatter!.reviewed as ReviewedShaMap)
      : reviewedFromLine.shas,
  );
  const reviewedDirty = frontmatter?.dirty ?? reviewedFromLine.dirty;

  const sessionNum =
    frontmatter?.round ??
    footer?.round ??
    Number(SESSION_LINE.exec(body)?.[1]) ??
    sessionNumFromName;

  const posted = POSTED_LINE.test(body);
  const findings = summarizeOpenFindings(body);
  const openFindingCount =
    frontmatter?.openFindings ?? findings.count;

  let clean: boolean | null = frontmatter?.clean ?? footer?.clean ?? null;
  const cleanExplicit = clean !== null;
  if (clean === null) {
    clean =
      openFindingCount === 0 ? inferCleanFromSections(body) : false;
  }

  return {
    path,
    sessionNum,
    reviewed,
    reviewedDirty,
    posted,
    clean,
    cleanExplicit,
    footerRound: footer?.round ?? null,
    openFindingCount,
    openFindingReasons: findings.reasons,
  };
}

function parseFooter(content: string) {
  const match = FOOTER_RE.exec(content);
  if (!match) return null;
  const block = match[1];
  const cleanRaw = block.match(/^clean:\s*(true|false)/im)?.[1];
  const roundRaw = block.match(/^round:\s*(\d+)/im)?.[1];
  return {
    clean:
      cleanRaw === "true" ? true : cleanRaw === "false" ? false : null,
    round: roundRaw ? Number(roundRaw) : null,
  };
}

function parseReviewedLine(content: string): {
  shas: ReviewedShaMap;
  dirty: boolean;
} {
  const line = REVIEWED_LINE.exec(content)?.[1]?.trim();
  if (!line) return { shas: {}, dirty: false };

  const dirty =
    /\+ uncommitted/i.test(line) ||
    /\+ dirty/i.test(line) ||
    /uncommitted/i.test(line);

  const shas: ReviewedShaMap = {};
  const codes = aliasPattern();
  const labeledSha = codes
    ? new RegExp("^(" + codes + ")\\s+[`']?([0-9a-f]+)[`']?", "i")
    : null;
  const parts = line.split(/·/).map((p) => p.trim());
  for (const part of parts) {
    const labeled = labeledSha ? part.match(labeledSha) : null;
    if (labeled) {
      shas[repoKeyFromToken(labeled[1])] = labeled[2].toLowerCase();
      continue;
    }
    const bare = part.match(/[`']?([0-9a-f]{7,40})[`']?/i);
    if (bare) shas.default = bare[1].toLowerCase();
  }

  return { shas, dirty };
}

const ACTIONABLE_SECTIONS = [
  "## Possible bugs",
  "## Contract",
  "## Deficiencies",
  "## Retracted code",
  "## Notes",
  "## .agents/rules/ conformity",
  "## Localization (JA)",
];

function summarizeOpenFindings(content: string): {
  count: number;
  reasons: string[];
} {
  let count = 0;
  const reasons: string[] = [];
  for (const heading of ACTIONABLE_SECTIONS) {
    const body = extractSection(content, heading);
    if (!body) continue;
    const sectionOpen = countOpenInSection(heading, body);
    if (sectionOpen <= 0) continue;
    count += sectionOpen;
    reasons.push(`${sectionLabel(heading)} (${sectionOpen})`);
  }
  return { count, reasons };
}

function sectionLabel(heading: string): string {
  return heading.replace(/^##\s*/, "");
}

function inferCleanFromSections(content: string): boolean {
  return summarizeOpenFindings(content).count === 0;
}

function extractSection(content: string, heading: string) {
  const start = content.indexOf(heading);
  if (start === -1) return null;
  const rest = content.slice(start + heading.length);
  const next = rest.search(/\n## /);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

function countOpenInSection(sectionHeading: string, body: string): number {
  if (!body) return 0;

  if (sectionHeading === "## .agents/rules/ conformity") {
    if (/no remaining fails/i.test(body)) return 0;
    if (/no rule fails/i.test(body)) return 0;
    return /\*\*[`']/.test(body) ? 1 : 0;
  }

  if (sectionHeading === "## Localization (JA)") {
    if (/verdict:\s*clean/i.test(body)) return 0;
    if (/no additional fails/i.test(body)) return 0;
    return /\|[^|\n]+\|[^|\n]+\|[^|\n]+\|/.test(body) ? 1 : 0;
  }

  const blocks = splitSubsections(body);
  if (blocks.length === 0) {
    return isCleanProse(body) ? 0 : 1;
  }

  let open = 0;
  for (const block of blocks) {
    if (isResolvedRewalk(block)) continue;
    if (isCleanProse(block)) continue;
    open += 1;
  }
  return open;
}

function splitSubsections(body: string): string[] {
  const lines = body.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.startsWith("### ")) {
      if (current.length) blocks.push(current.join("\n"));
      current = [line];
    } else if (current.length) {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current.join("\n"));
  return blocks;
}

function isResolvedRewalk(block: string): boolean {
  if (!/\*\*Re-walk:\*\*/i.test(block)) return false;
  return /\*\*Re-walk:\*\*\s*(Fixed|Partly fixed|accepted trade-off)/i.test(
    block,
  );
}

function isCleanProse(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  const first = t.split("\n")[0]?.trim() ?? "";
  return (
    /^no (bugs|routed|stale|remaining|rule)/i.test(first) ||
    /^not re-run:/i.test(first) ||
    /^no (additional )?fails/i.test(first) ||
    /^no exported api changes/i.test(first) ||
    /^no stale consumers/i.test(first)
  );
}

export function sessionNumberFromFilename(name: string): number {
  const match = name.match(/-(\d+)\.md$/);
  return match ? Number(match[1]) : 0;
}

export function shaMatchesReviewed(
  headOid: string | undefined,
  reviewedSha: string | undefined,
): boolean | null {
  if (!headOid || !reviewedSha) return null;
  const head = headOid.toLowerCase();
  const rev = reviewedSha.toLowerCase();
  return head.startsWith(rev) || rev.startsWith(head);
}

/** Reviewed SHAs keyed by repo key (aliases resolved), plus `default`. */
function canonicalReviewedKeys(shas: ReviewedShaMap): ReviewedShaMap {
  const out: ReviewedShaMap = {};
  for (const [key, sha] of Object.entries(shas)) {
    out[key === "default" ? key : repoKeyFromToken(key)] = sha;
  }
  return out;
}
