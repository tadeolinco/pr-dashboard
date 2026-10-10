import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  fetchOwner,
  fetchOwnerRepos,
  fetchViewerOwners,
  type OwnerOption,
} from "@/lib/github-owners";
import {
  GITHUB_LOGIN,
  type PrScope,
  type ScopeOwner,
} from "@/lib/scope";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

export function ScopePicker({
  token,
  initial,
  onSave,
  onCancel,
}: {
  token: string;
  initial: PrScope;
  onSave: (scope: PrScope) => void;
  onCancel?: () => void;
}) {
  const [options, setOptions] = useState<OwnerOption[]>(() =>
    initial.owners.map(({ login, type, avatarUrl }) => ({ login, type, avatarUrl })),
  );
  const [selected, setSelected] = useState<Map<string, ScopeOwner>>(
    () => new Map(initial.owners.map((owner) => [owner.login.toLowerCase(), owner])),
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingOwners, setLoadingOwners] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchViewerOwners(token)
      .then((owners) => {
        if (cancelled) return;
        setOptions((current) => mergeOptions(owners, current));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(
          error instanceof Error ? error.message : "Could not list your organizations",
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingOwners(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  function toggleOwner(option: OwnerOption, checked: boolean) {
    setSelected((current) => {
      const next = new Map(current);
      if (checked) next.set(option.login.toLowerCase(), { ...option, repos: null });
      else next.delete(option.login.toLowerCase());
      return next;
    });
  }

  function setOwnerRepos(login: string, repos: string[] | null) {
    setSelected((current) => {
      const key = login.toLowerCase();
      const owner = current.get(key);
      if (!owner) return current;
      const next = new Map(current);
      next.set(key, { ...owner, repos });
      return next;
    });
  }

  const selectedOwners = [...selected.values()];
  const canSave =
    selectedOwners.length > 0 &&
    selectedOwners.every((owner) => owner.repos === null || owner.repos.length > 0);

  return (
    <main className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <h1 className="font-heading text-2xl font-medium">Orgs &amp; repos</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose whose pull requests to show. Saved in this browser only.
        </p>

        <Card className="mt-6 gap-0 divide-y p-0">
          {options.map((option) => (
            <OwnerRow
              key={option.login}
              token={token}
              option={option}
              selection={selected.get(option.login.toLowerCase()) ?? null}
              onToggle={(checked) => toggleOwner(option, checked)}
              onReposChange={(repos) => setOwnerRepos(option.login, repos)}
            />
          ))}
          {loadingOwners ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              Loading your organizations…
            </p>
          ) : null}
          {loadError ? (
            <p className="px-4 py-3 text-sm text-destructive">{loadError}</p>
          ) : null}
          <AddOwnerForm
            token={token}
            onAdd={(option) => {
              setOptions((current) => mergeOptions(current, [option]));
              toggleOwner(option, true);
            }}
          />
        </Card>

        <div className="mt-6 flex items-center gap-2">
          <Button
            type="button"
            disabled={!canSave}
            onClick={() => onSave({ owners: selectedOwners })}
          >
            Save
          </Button>
          {onCancel ? (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function OwnerRow({
  token,
  option,
  selection,
  onToggle,
  onReposChange,
}: {
  token: string;
  option: OwnerOption;
  selection: ScopeOwner | null;
  onToggle: (checked: boolean) => void;
  onReposChange: (repos: string[] | null) => void;
}) {
  const checkboxId = `owner-${option.login}`;
  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <input
          id={checkboxId}
          type="checkbox"
          className="size-4 accent-primary"
          checked={selection !== null}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <Avatar size="sm">
          {option.avatarUrl ? (
            <AvatarImage src={option.avatarUrl} alt={option.login} />
          ) : null}
          <AvatarFallback>{option.login.slice(0, 2)}</AvatarFallback>
        </Avatar>
        <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer text-sm">
          <span className="font-medium">{option.login}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {option.type === "Organization" ? "Organization" : "User"}
          </span>
        </label>
        {selection ? (
          <div className="flex rounded-lg border p-0.5 text-xs">
            <ModeButton
              active={selection.repos === null}
              onClick={() => onReposChange(null)}
            >
              All repos
            </ModeButton>
            <ModeButton
              active={selection.repos !== null}
              onClick={() => onReposChange(selection.repos ?? [])}
            >
              Pick repos
            </ModeButton>
          </div>
        ) : null}
      </div>
      {selection?.repos ? (
        <RepoChecklist
          token={token}
          login={option.login}
          selected={selection.repos}
          onChange={onReposChange}
        />
      ) : null}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-md px-2 py-0.5 font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function RepoChecklist({
  token,
  login,
  selected,
  onChange,
}: {
  token: string;
  login: string;
  selected: string[];
  onChange: (repos: string[]) => void;
}) {
  const [repos, setRepos] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchOwnerRepos(token, login)
      .then((names) => {
        if (!cancelled) setRepos(names);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Could not list repos");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, login]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    // Keep picked repos listed even if GitHub no longer returns them.
    const all = [...new Set([...selected, ...(repos ?? [])])];
    return needle ? all.filter((name) => name.toLowerCase().includes(needle)) : all;
  }, [query, repos, selected]);

  function toggle(name: string, checked: boolean) {
    onChange(checked ? [...selected, name] : selected.filter((repo) => repo !== name));
  }

  return (
    <div className="mt-3 ml-7 space-y-2">
      <input
        type="search"
        placeholder="Filter repos"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {repos === null && !error ? (
        <p className="text-xs text-muted-foreground">Loading repos…</p>
      ) : null}
      <div className="max-h-56 space-y-1 overflow-auto">
        {visible.map((name) => (
          <label key={name} className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="size-3.5 accent-primary"
              checked={selectedSet.has(name)}
              onChange={(event) => toggle(name, event.target.checked)}
            />
            <span className="font-mono">{name}</span>
          </label>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {selected.length === 0
          ? "Pick at least one repo."
          : `${selected.length} selected`}
      </p>
    </div>
  );
}

function AddOwnerForm({
  token,
  onAdd,
}: {
  token: string;
  onAdd: (option: OwnerOption) => void;
}) {
  const [login, setLogin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = login.trim();
    if (!GITHUB_LOGIN.test(trimmed)) {
      setError("Enter a GitHub org or user name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const owner = await fetchOwner(token, trimmed);
      if (!owner) {
        setError(`No org or user named ${trimmed} is visible to this token.`);
        return;
      }
      onAdd(owner);
      setLogin("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-1.5 px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p className="text-xs text-muted-foreground">
        Org missing? GitHub only lists private org memberships when the token has{" "}
        <code className="text-[11px]">read:org</code>. Add it by name:
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="org-name"
          autoComplete="off"
          spellCheck={false}
          value={login}
          onChange={(event) => setLogin(event.target.value)}
          className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button type="submit" variant="outline" size="sm" disabled={busy || !login.trim()}>
          Add
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </form>
  );
}

function mergeOptions(first: OwnerOption[], second: OwnerOption[]) {
  const byLogin = new Map<string, OwnerOption>();
  for (const option of [...first, ...second]) {
    const key = option.login.toLowerCase();
    if (!byLogin.has(key)) byLogin.set(key, option);
  }
  return [...byLogin.values()];
}
