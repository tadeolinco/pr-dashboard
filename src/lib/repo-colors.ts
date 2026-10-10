import type { CSSProperties } from "react";
import {
  colorForRepository,
  pickedRepoColors,
  repoSettingsVersion,
} from "@/lib/repo-settings";

/** Distinct hues, ordered so neighbours contrast; defaults walk this list. */
export const REPO_COLOR_PALETTE = [
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#f59e0b", // amber
  "#f43f5e", // rose
  "#6366f1", // indigo
  "#14b8a6", // teal
  "#f97316", // orange
  "#d946ef", // fuchsia
  "#84cc16", // lime
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#3b82f6", // blue
  "#22c55e", // green
  "#a855f7", // purple
  "#ef4444", // red
];

// Default colours handed out this session, keyed by lowercased repo name.
let assigned = new Map<string, string>();
let assignedForVersion = -1;

function resetIfSettingsChanged() {
  if (assignedForVersion === repoSettingsVersion()) return;
  assigned = new Map();
  assignedForVersion = repoSettingsVersion();
}

function nextDefaultColor() {
  const taken = new Set([...pickedRepoColors(), ...assigned.values()]);
  return (
    REPO_COLOR_PALETTE.find((color) => !taken.has(color)) ??
    // More repos than colours: start reusing in palette order.
    REPO_COLOR_PALETTE[assigned.size % REPO_COLOR_PALETTE.length]!
  );
}

/**
 * Each repo gets the palette slot matching its alphabetical position, so the
 * same repos get the same colours on every load. Only a repo whose slot clashes
 * with a picked colour moves, to the first free one; picking a colour for one
 * repo never reshuffles the others. Call with every repo about to be shown.
 */
export function primeRepoColors(repositoryNames: string[]) {
  resetIfSettingsChanged();
  const names = [...new Set(repositoryNames.map((name) => name.toLowerCase()))].sort();
  const picked = new Set(pickedRepoColors());
  const slotFor = (index: number) =>
    REPO_COLOR_PALETTE[index % REPO_COLOR_PALETTE.length]!;
  // Slots other repos will claim; a displaced repo must not take one of these.
  const reserved = new Set(
    names.flatMap((name, index) => (colorForRepository(name) ? [] : [slotFor(index)])),
  );
  names.forEach((name, index) => {
    if (colorForRepository(name) || assigned.has(name)) return;
    const taken = new Set([...picked, ...assigned.values()]);
    const slot = slotFor(index);
    if (!taken.has(slot)) {
      assigned.set(name, slot);
      return;
    }
    const spare = REPO_COLOR_PALETTE.find(
      (color) => !taken.has(color) && !reserved.has(color),
    );
    assigned.set(name, spare ?? nextDefaultColor());
  });
}

export function repoColor(repositoryName: string): string {
  const picked = colorForRepository(repositoryName);
  if (picked) return picked;
  resetIfSettingsChanged();
  const key = repositoryName.toLowerCase();
  let color = assigned.get(key);
  if (!color) {
    color = nextDefaultColor();
    assigned.set(key, color);
  }
  return color;
}

/** Tinted badge built from one colour; works in light and dark themes. */
export const REPO_BADGE_CLASS =
  "bg-[color-mix(in_oklab,var(--repo-color)_16%,transparent)] text-[color-mix(in_oklab,var(--repo-color)_62%,black)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--repo-color)_35%,transparent)] dark:text-[color-mix(in_oklab,var(--repo-color)_55%,white)]";

export function repoBadgeStyle(repositoryName: string): CSSProperties {
  return { "--repo-color": repoColor(repositoryName) } as CSSProperties;
}
