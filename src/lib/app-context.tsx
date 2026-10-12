import type { AppPreferences } from "@/lib/app-preferences";
import type { AppConfig } from "@/lib/config";
import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

export type AppContextValue = {
  config: AppConfig;
  preferences: AppPreferences;
  setPreferences: (update: Partial<AppPreferences>) => void;
  refresh: () => void;
  refreshGeneration: number;
  /** True when `refreshGeneration` was bumped by a background refresh: update in place, no loaders. */
  silentRefresh: boolean;
  /** A background refresh is loading; the header shows a dot instead of a skeleton. */
  backgroundRefreshing: boolean;
  /** Replaces the dashboard with a settings page until it is saved or cancelled. */
  openPage: (page: SettingsPage) => void;
};

/** Orgs & repos picker, per-repo settings, bot accounts. */
export type SettingsPage = "scope" | "repos" | "bots";

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  value,
  children,
}: {
  value: AppContextValue;
  children: ReactNode;
}) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error("useApp must be used within AppProvider");
  }
  return value;
}
