import type { MergeStateStatus } from "@/lib/types";

/** Head branch is missing commits from the PR base (GitHub “out-of-date”). */
export function isBehindTarget(
  status: MergeStateStatus | null | undefined,
): boolean {
  return status === "BEHIND";
}

export function hasMergeConflicts(
  status: MergeStateStatus | null | undefined,
): boolean {
  return status === "DIRTY";
}

/** Higher = more urgent when sorting desc. */
export function baseSyncSortRank(
  status: MergeStateStatus | null | undefined,
): number {
  if (status === "DIRTY") return 3;
  if (status === "BEHIND") return 2;
  if (status === "UNKNOWN" || status == null) return 1;
  return 0;
}

export function baseSyncLabel(
  status: MergeStateStatus | null | undefined,
): "yes" | "no" | "conflict" | "unknown" {
  if (status === "BEHIND") return "yes";
  if (status === "DIRTY") return "conflict";
  if (
    status === "CLEAN" ||
    status === "UNSTABLE" ||
    status === "HAS_HOOKS" ||
    status === "BLOCKED"
  ) {
    return "no";
  }
  return "unknown";
}

export function baseSyncTooltip(
  status: MergeStateStatus | null | undefined,
  baseRefName: string,
): string {
  switch (status) {
    case "BEHIND":
      return `Head branch is behind ${baseRefName}`;
    case "DIRTY":
      return `Merge conflicts with ${baseRefName}`;
    case "CLEAN":
      return `Up to date with ${baseRefName}`;
    case "UNSTABLE":
      return `Up to date with ${baseRefName} (checks or status may block merge)`;
    case "BLOCKED":
      return `Up to date with ${baseRefName} (merge blocked by reviews or rules)`;
    case "HAS_HOOKS":
      return `Up to date with ${baseRefName} (pre-receive hooks pending)`;
    case "UNKNOWN":
      return `Could not determine sync with ${baseRefName}`;
    default:
      return `Sync with ${baseRefName} unknown`;
  }
}
