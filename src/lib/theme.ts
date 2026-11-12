import { useCallback, useEffect, useSyncExternalStore } from "react";

export type ThemeChoice = "system" | "light" | "dark";

/** Starts with `pr-dashboard.` so Settings → Clear data removes it too. */
const STORAGE_KEY = "pr-dashboard.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

const listeners = new Set<() => void>();

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches;
}

/** Puts `.dark` on <html> for the saved choice (or the OS setting on System). */
export function applyTheme(choice: ThemeChoice = readChoice()) {
  if (typeof document === "undefined") return;
  const dark = choice === "dark" || (choice === "system" && systemPrefersDark());
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

function setChoice(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  applyTheme(choice);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const NEXT_CHOICE: Record<ThemeChoice, ThemeChoice> = {
  system: "light",
  light: "dark",
  dark: "system",
};

export function useTheme() {
  const choice = useSyncExternalStore(subscribe, readChoice, () => "system" as const);

  // On System, follow the OS when it switches while the page is open.
  useEffect(() => {
    if (choice !== "system") return;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [choice]);

  const cycle = useCallback(() => setChoice(NEXT_CHOICE[readChoice()]), []);
  return { choice, cycle };
}
