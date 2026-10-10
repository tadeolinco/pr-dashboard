import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApp } from "@/lib/app-context";
import { useNavigation } from "@/lib/navigation";
import { clearLocalData } from "@/lib/app-preferences";
import { DEFAULT_BOT_LOGINS } from "@/lib/bots";
import { setupLinkFor } from "@/lib/setup-link";
import {
  chooseDocsFolder,
  forgetDocsFolder,
  reconnectDocsFolder,
} from "@/lib/docs-folder";
import type { DocsAccess } from "@/lib/docs-folder";
import { cn } from "@/lib/utils";
import { Settings } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export function AppSettingsPanel({ className }: { className?: string }) {
  const { config, preferences, setPreferences, refresh, openPage } = useApp();
  const [open, setOpen] = useState(false);
  const [tokenDraft, setTokenDraft] = useState(preferences.githubToken);
  const { filters } = useNavigation();
  const panelRef = useRef<HTMLDivElement>(null);
  const tokenFieldId = useId();
  const localDocsId = useId();

  useEffect(() => {
    if (open) setTokenDraft(preferences.githubToken);
  }, [open, preferences.githubToken]);

  function commitTokenDraft() {
    const trimmed = tokenDraft.trim();
    if (trimmed !== preferences.githubToken) {
      setPreferences({ githubToken: trimmed });
    }
  }

  function closePanel() {
    commitTokenDraft();
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      commitTokenDraft();
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, preferences.githubToken, tokenDraft, setPreferences]);

  return (
    <div className={cn("relative", className)} ref={panelRef}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => (open ? closePanel() : setOpen(true))}
      >
        <Settings className="size-3.5" />
        Settings
      </Button>
      {open ? (
        <Card className="absolute top-full right-0 z-[100] mt-2 max-h-[calc(100dvh-5rem)] w-[min(100vw-2rem,22rem)] overflow-auto gap-0 p-0 shadow-lg">
          <div className="border-b px-4 py-3">
            <p className="font-heading text-sm font-medium">Settings</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Stored in this browser only.
            </p>
          </div>
          <div className="space-y-5 px-4 py-4">
            <div className="space-y-1.5">
              <label
                htmlFor={tokenFieldId}
                className="text-xs font-medium text-foreground"
              >
                GitHub personal access token
              </label>
              <input
                id={tokenFieldId}
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="ghp_…"
                value={tokenDraft}
                onChange={(event) => setTokenDraft(event.target.value)}
                onBlur={commitTokenDraft}
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <p className="text-[11px] leading-snug text-muted-foreground">
                Needs the <code className="text-[10px]">repo</code> scope. Kept
                in this browser&apos;s storage and only sent to api.github.com.
              </p>
            </div>
            {preferences.githubToken ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Orgs &amp; repos</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {preferences.scope.owners.length === 0
                      ? "Nothing selected"
                      : preferences.scope.owners
                          .map((owner) =>
                            owner.repos
                              ? `${owner.login} (${owner.repos.length})`
                              : owner.login,
                          )
                          .join(", ")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    closePanel();
                    openPage("scope");
                  }}
                >
                  Edit
                </Button>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Repo settings</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {preferences.repoSettings.length > 0
                    ? `${preferences.repoSettings.length} repo${preferences.repoSettings.length === 1 ? "" : "s"} configured`
                    : "Aliases, branches, diff counts"}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  closePanel();
                  openPage("repos");
                }}
              >
                Edit
              </Button>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Bot accounts</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {preferences.botLogins === null
                    ? `Default list · ${DEFAULT_BOT_LOGINS.length} accounts`
                    : `Custom list · ${preferences.botLogins.length} accounts`}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  closePanel();
                  openPage("bots");
                }}
              >
                Edit
              </Button>
            </div>
            <ShareSetupRow />
            {filters.advanced ? (
              <DocsIntegrationSetting
                id={localDocsId}
                enabled={preferences.localDocsIntegration}
                access={config.docsFolder.access}
                folderName={config.docsFolder.name}
                onEnable={async () => {
                  const ok =
                    config.docsFolder.access === "granted" ||
                    (config.docsFolder.access === "needs-permission"
                      ? await reconnectDocsFolder()
                      : (await chooseDocsFolder()) !== null);
                  if (ok) setPreferences({ localDocsIntegration: true });
                }}
                onDisable={async () => {
                  await forgetDocsFolder();
                  setPreferences({ localDocsIntegration: false });
                }}
                onChangeFolder={async () => {
                  if (await chooseDocsFolder()) refresh();
                }}
              />
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
            <p className="text-xs leading-snug text-muted-foreground">
              Remove the token, settings and cached data from this browser.
            </p>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={async () => {
                await clearLocalData();
                window.location.reload();
              }}
            >
              Clear data
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function DocsIntegrationSetting({
  id,
  enabled,
  access,
  folderName,
  onEnable,
  onDisable,
  onChangeFolder,
}: {
  id: string;
  enabled: boolean;
  access: DocsAccess;
  folderName: string | null;
  onEnable: () => Promise<void>;
  onDisable: () => Promise<void>;
  onChangeFolder: () => Promise<void>;
}) {
  const unsupported = access === "unsupported";
  return (
    <div className="space-y-2">
      <PreferenceToggle
        id={id}
        label="Local docs integration"
        description={
          unsupported
            ? "Needs Chrome, Edge, or another Chromium browser to read a local folder."
            : "Review, Clean, Stale, and Triage columns from a docs folder on this computer. Read-only."
        }
        checked={enabled && !unsupported}
        disabled={unsupported}
        onCheckedChange={(checked) => void (checked ? onEnable() : onDisable())}
      />
      {enabled && !unsupported && folderName ? (
        <div className="flex items-center justify-between gap-2 pl-12 text-xs">
          <span className="min-w-0 truncate text-muted-foreground">
            {access === "granted" ? "Reading" : "Needs access to"}{" "}
            <code className="text-[11px] text-foreground">{folderName}/</code>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => void onChangeFolder()}
          >
            Change
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function PreferenceToggle({
  id,
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full border border-transparent transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-primary" : "bg-input",
        )}
      >
        <span
          className={cn(
            "pointer-events-none block size-4 translate-y-0.5 rounded-full bg-background shadow-sm transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium">
          {label}
        </label>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

/** Copies a `?setup=` link with everything except the token and docs toggle. */
function ShareSetupRow() {
  const { preferences } = useApp();
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    const link = setupLinkFor({
      scope: preferences.scope,
      repoSettings: preferences.repoSettings,
      botLogins: preferences.botLogins,
    });
    try {
      await navigator.clipboard.writeText(link);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    window.setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">Share setup</p>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
          Link with your orgs &amp; repos, repo settings and bot accounts. Never
          includes your token.
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
        {status === "copied" ? "Copied" : status === "failed" ? "Copy failed" : "Copy link"}
      </Button>
    </div>
  );
}
