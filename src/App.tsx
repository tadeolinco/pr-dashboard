import { AppSettingsPanel } from "@/components/app-settings-panel";
import { Dashboard } from "@/components/dashboard";
import { DashboardSkeleton } from "@/components/dashboard-skeleton";
import { RefreshButton } from "@/components/refresh-button";
import { BotSettingsPage } from "@/components/bot-settings-page";
import { RepoSettingsPage } from "@/components/repo-settings-page";
import { repositoryNameFromFullName } from "@/components/repo-badge";
import { ScopePicker } from "@/components/scope-picker";
import { SetupLinkBanner, type SetupNotice } from "@/components/setup-link-banner";
import { SetupMissingToken } from "@/components/setup-missing-token";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AppProvider, useApp, type SettingsPage } from "@/lib/app-context";
import {
  readAppPreferences,
  writeAppPreferences,
  type AppPreferences,
} from "@/lib/app-preferences";
import type { AppConfig } from "@/lib/config";
import { loadAppConfig } from "@/lib/config";
import {
  MissingGithubTokenError,
  assembleDashboardData,
  invalidateDashboardCaches,
} from "@/lib/dashboard-data";
import { formatCount } from "@/lib/format";
import { reconnectDocsFolder } from "@/lib/docs-folder";
import { NavigationProvider, useNavigation } from "@/lib/navigation";
import { primeRepoColors } from "@/lib/repo-colors";
import { EMPTY_SCOPE, isScopeEmpty } from "@/lib/scope";
import {
  consumeSetupParam,
  readSuggestedScope,
  writeSuggestedScope,
} from "@/lib/setup-link";
import type { DashboardData } from "@/lib/types";
import { useBackgroundRefresh } from "@/lib/use-background-refresh";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const EMPTY_CONFIG: AppConfig = {
  githubToken: null,
  scope: EMPTY_SCOPE,
  docsFolder: { access: "not-chosen", handle: null, name: null },
  localDocsIntegration: false,
};

export function App() {
  return (
    <NavigationProvider>
      <AppShell />
    </NavigationProvider>
  );
}

/**
 * A `?setup=` link applies straight away for someone with nothing configured;
 * anyone with their own settings is asked first (see SetupLinkBanner).
 */
function loadInitialPreferences(): {
  preferences: AppPreferences;
  setupNotice: SetupNotice | null;
} {
  const preferences = readAppPreferences();
  const setup = consumeSetupParam();
  if (setup === null) return { preferences, setupNotice: null };
  if (setup === "invalid") return { preferences, setupNotice: { kind: "invalid" } };

  const fresh =
    preferences.repoSettings.length === 0 &&
    preferences.botLogins === null &&
    isScopeEmpty(preferences.scope);
  if (!fresh) return { preferences, setupNotice: { kind: "confirm", setup } };

  writeSuggestedScope(setup.scope);
  return {
    preferences: writeAppPreferences({
      repoSettings: setup.repoSettings,
      botLogins: setup.botLogins,
    }),
    setupNotice: { kind: "applied", setup },
  };
}

function AppShell() {
  const { filters } = useNavigation();
  const [config, setConfig] = useState<AppConfig>(EMPTY_CONFIG);
  const [initial] = useState(loadInitialPreferences);
  const [preferences, setPreferencesState] = useState<AppPreferences>(
    initial.preferences,
  );
  const [setupNotice, setSetupNotice] = useState<SetupNotice | null>(
    initial.setupNotice,
  );
  const [refreshGeneration, setRefreshGeneration] = useState(0);
  // Whether the latest generation came from a background refresh: no skeletons, keep old data on failure.
  const [silentRefresh, setSilentRefresh] = useState(false);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [page, setPage] = useState<SettingsPage | null>(null);
  const openPage = useCallback((next: SettingsPage) => setPage(next), []);
  const closePage = useCallback(() => setPage(null), []);

  const refresh = useCallback(() => {
    invalidateDashboardCaches();
    setSilentRefresh(false);
    setRefreshGeneration((generation) => generation + 1);
  }, []);

  const backgroundRefresh = useCallback(() => {
    invalidateDashboardCaches();
    setSilentRefresh(true);
    setRefreshGeneration((generation) => generation + 1);
  }, []);

  const lastLoadedAt = useRef<number | null>(null);
  const inFlight = useRef(false);

  const setPreferences = useCallback(
    (update: Partial<AppPreferences>) => {
      setPreferencesState((current) => {
        const next = { ...current, ...update };
        writeAppPreferences(next);
        return next;
      });
      refresh();
    },
    [refresh],
  );

  useEffect(() => {
    let cancelled = false;
    const silent = silentRefresh;
    inFlight.current = true;
    setBackgroundRefreshing(silent);
    if (!silent) {
      setLoading(true);
      setError(null);
      setNeedsSetup(false);
    }

    void (async () => {
      try {
        const nextConfig = await loadAppConfig();
        if (cancelled) return;
        setConfig(nextConfig);
        if (!nextConfig.githubToken) {
          setNeedsSetup(true);
          setData(null);
          return;
        }
        if (isScopeEmpty(nextConfig.scope)) {
          setData(null);
          return;
        }
        const dashboard = await assembleDashboardData(
          nextConfig.githubToken,
          nextConfig.scope,
          nextConfig.localDocsIntegration ? nextConfig.docsFolder.handle : null,
        );
        if (cancelled) return;
        setData(dashboard);
        setError(null);
        lastLoadedAt.current = Date.now();
      } catch (caught) {
        if (cancelled) return;
        // A failed background refresh keeps what is on screen; the next one retries.
        if (silent) return;
        if (caught instanceof MissingGithubTokenError) {
          setNeedsSetup(true);
          setData(null);
          return;
        }
        setError(caught instanceof Error ? caught : new Error(String(caught)));
        setData(null);
      } finally {
        if (!cancelled) {
          inFlight.current = false;
          setBackgroundRefreshing(false);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // silentRefresh only describes the generation; it never triggers a load on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshGeneration]);

  const appValue = useMemo(
    () => ({
      config,
      preferences,
      setPreferences,
      refresh,
      refreshGeneration,
      silentRefresh,
      backgroundRefreshing,
      openPage,
    }),
    [
      config,
      preferences,
      setPreferences,
      refresh,
      refreshGeneration,
      silentRefresh,
      backgroundRefreshing,
      openPage,
    ],
  );

  const token = config.githubToken;
  useBackgroundRefresh({
    enabled: Boolean(data) && !error && page === null,
    lastLoadedAt,
    inFlight,
    onRefresh: backgroundRefresh,
  });

  // Settings pages replace the dashboard; the orgs picker is forced until a scope exists.
  const activePage: SettingsPage | null =
    loading || needsSetup || token === null
      ? null
      : isScopeEmpty(config.scope)
        ? "scope"
        : page;
  const knownRepos = useMemo(
    () => [
      ...new Set(data?.pullRequests.map((pr) => pr.repository.nameWithOwner) ?? []),
    ],
    [data],
  );
  // Hand out default badge colours alphabetically before any badge renders.
  useMemo(
    () => primeRepoColors(knownRepos.map(repositoryNameFromFullName)),
    // repoSettings: colours picked there change which defaults are free.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [knownRepos, preferences.repoSettings],
  );

  return (
    <AppProvider value={appValue}>
      <div className="flex min-h-0 flex-1 flex-col">
        {/* One header for every state, so Settings stays open across reloads. */}
        <AppHeader
          login={data?.viewer.login}
          name={data?.viewer.name}
          avatarUrl={data?.viewer.avatarUrl}
          count={data?.pullRequests.length}
        />
        {setupNotice ? (
          <SetupLinkBanner
            notice={setupNotice}
            onApply={(setup) => {
              setSetupNotice(null);
              setPreferences({
                repoSettings: setup.repoSettings,
                botLogins: setup.botLogins,
                ...(isScopeEmpty(setup.scope) ? {} : { scope: setup.scope }),
              });
            }}
            onDismiss={() => setSetupNotice(null)}
          />
        ) : null}
        {loading ? <DashboardSkeleton /> : null}
        {!loading && needsSetup ? <SetupMissingToken /> : null}
        {activePage === "scope" && token ? (
          <ScopePicker
            token={token}
            initial={
              isScopeEmpty(config.scope)
                ? (readSuggestedScope() ?? config.scope)
                : config.scope
            }
            onSave={(scope) => {
              closePage();
              writeSuggestedScope(null);
              setPreferences({ scope });
            }}
            onCancel={isScopeEmpty(config.scope) ? undefined : closePage}
          />
        ) : null}
        {activePage === "repos" ? (
          <RepoSettingsPage
            settings={preferences.repoSettings}
            knownRepos={knownRepos}
            onSave={(repoSettings) => {
              closePage();
              setPreferences({ repoSettings });
            }}
            onCancel={closePage}
          />
        ) : null}
        {activePage === "bots" ? (
          <BotSettingsPage
            botLogins={preferences.botLogins}
            onSave={(botLogins) => {
              closePage();
              setPreferences({ botLogins });
            }}
            onCancel={closePage}
          />
        ) : null}
        {!loading && error && !activePage ? (
          <ErrorPanel error={error} onRetry={refresh} />
        ) : null}
        {!loading && data && !needsSetup && !error && !activePage ? (
          <Dashboard data={data} filters={filters} />
        ) : null}
      </div>
    </AppProvider>
  );
}

function AppHeader({
  login,
  name,
  avatarUrl,
  count,
}: {
  login?: string;
  name?: string | null;
  avatarUrl?: string;
  count?: number;
}) {
  return (
    <header className="relative z-30 shrink-0 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4 lg:px-8">
        <div className="min-w-0">
          <p className="font-heading text-sm font-medium">PR dashboard</p>
          <p className="truncate text-xs text-muted-foreground">
            {typeof count === "number"
              ? `${formatCount(count)} open pull request${count === 1 ? "" : "s"}`
              : "Pull requests"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ReconnectDocsButton />
          <AppSettingsPanel />
          {login ? <RefreshButton /> : null}
          {login ? (
            <div className="flex items-center gap-2">
              <Avatar size="sm">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={login} /> : null}
                <AvatarFallback>{login.slice(0, 2)}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm sm:inline">{name ?? login}</span>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

/** Browsers drop folder access between visits; re-granting needs a click. */
function ReconnectDocsButton() {
  const { config, preferences, refresh } = useApp();
  if (!preferences.localDocsIntegration) return null;
  if (config.docsFolder.access !== "needs-permission") return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        if (await reconnectDocsFolder()) refresh();
      }}
    >
      Reconnect docs folder
    </Button>
  );
}

function ErrorPanel({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-16">
      <h1 className="font-heading text-2xl font-medium">
        Could not load pull requests
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {error.message || "GitHub returned an unexpected error."}
      </p>
      <Button className="mt-6 w-fit" onClick={onRetry}>
        Try again
      </Button>
    </main>
  );
}
