import type { ReviewedShaMap } from "@/lib/review-session/types";
import { parse as parseYaml } from "yaml";

export type ReviewFrontmatter = {
  round: number;
  clean: boolean;
  dirty: boolean;
  openFindings: number;
  reviewed: ReviewedShaMap;
};

export function readReviewFrontmatter(data: Record<string, unknown>) {
  const raw = data.review;
  if (!raw || typeof raw !== "object") return null;

  const review = raw as Record<string, unknown>;
  const round = typeof review.round === "number" ? review.round : null;
  const clean =
    review.clean === true ? true : review.clean === false ? false : null;
  const dirty = review.dirty === true;
  const openFindings =
    typeof review.openFindings === "number" ? review.openFindings : null;
  const reviewed = parseReviewedMap(review.reviewed);

  if (
    round === null &&
    clean === null &&
    !dirty &&
    openFindings === null &&
    Object.keys(reviewed).length === 0
  ) {
    return null;
  }

  return {
    round,
    clean,
    dirty,
    openFindings,
    reviewed,
  };
}

function parseReviewedMap(value: unknown): ReviewedShaMap {
  if (!value || typeof value !== "object") return {};
  const shas: ReviewedShaMap = {};
  for (const [key, sha] of Object.entries(value as Record<string, unknown>)) {
    if (typeof sha === "string" && /^[0-9a-f]{7,40}$/i.test(sha)) {
      shas[key] = sha.toLowerCase();
    }
  }
  return shas;
}

const FRONTMATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** Splits a leading `---` YAML block from the markdown body. Data only, never code. */
export function splitSessionMarkdown(content: string): {
  data: Record<string, unknown>;
  content: string;
} {
  const match = content.match(FRONTMATTER);
  if (!match) return { data: {}, content };
  try {
    const data: unknown = parseYaml(match[1]);
    return {
      data:
        data && typeof data === "object" && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : {},
      content: content.slice(match[0].length),
    };
  } catch {
    return { data: {}, content };
  }
}
