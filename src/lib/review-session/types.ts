export type ReviewedShaMap = Record<string, string>;

export type ParsedSessionFile = {
  path: string;
  sessionNum: number;
  reviewed: ReviewedShaMap;
  reviewedDirty: boolean;
  posted: boolean;
  /** From HTML footer when present; otherwise from heuristics. */
  clean: boolean | null;
  /** True when `clean` came from frontmatter or HTML footer, not heuristics. */
  cleanExplicit: boolean;
  footerRound: number | null;
  openFindingCount: number;
  /** Non-empty sections contributing to open findings (for UI). */
  openFindingReasons: string[];
};

export type PrReviewStatus = {
  /** Latest session number under docs/prs (0 = no session). */
  round: number;
  sessionPath: string | null;
  clean: boolean | null;
  cleanExplicit: boolean;
  stale: boolean | null;
  reviewedShas: ReviewedShaMap;
  posted: boolean;
  openFindings: number;
  openFindingReasons: string[];
};
