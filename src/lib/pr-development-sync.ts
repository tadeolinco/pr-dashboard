import type { DevelopmentSyncStatus } from "@/lib/types";

export function developmentSyncLabel(
  status: DevelopmentSyncStatus | null | undefined,
): "yes" | "no" | "na" | "unknown" {
  if (status === "in_dev") return "yes";
  if (status === "not_in_dev") return "no";
  if (status === "unavailable") return "na";
  return "unknown";
}

export function developmentSyncSortRank(
  status: DevelopmentSyncStatus | null | undefined,
): number {
  if (status === "not_in_dev") return 3;
  if (status === "unknown") return 2;
  if (status === "unavailable") return 1;
  if (status === "in_dev") return 0;
  return 2;
}

export function developmentSyncTooltip(
  status: DevelopmentSyncStatus | null | undefined,
  developmentBranch: string,
  headRefName: string,
): string {
  switch (status) {
    case "in_dev":
      return `Latest commit on ${headRefName} is already on ${developmentBranch}`;
    case "not_in_dev":
      return `Latest commit on ${headRefName} is not on ${developmentBranch} yet`;
    case "unavailable":
      return `No ${developmentBranch} branch in this repository (set another in Settings → Repo settings)`;
    default:
      return `Could not compare ${headRefName} with ${developmentBranch}`;
  }
}
