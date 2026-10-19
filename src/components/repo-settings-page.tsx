import { REPO_BADGE_CLASS, repoColor } from "@/lib/repo-colors";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DEFAULT_INTEGRATION_BRANCH,
  isValidRepoName,
  parseAliasNames,
  parseBranchList,
  parseBranchName,
  parseColor,
  twoLetterRepoLabel,
  parseIgnoredPaths,
  type RepoSettings,
} from "@/lib/repo-settings";
import { useState } from "react";

type DraftRow = {
  repo: string;
  names: string;
  ignoredPaths: string;
  targetBranch: string;
  integrationBranch: string;
  loadIgnoredBranches: string;
  /** Empty means the palette default. */
  color: string;
};

const EMPTY_FIELDS = {
  names: "",
  ignoredPaths: "",
  targetBranch: "",
  integrationBranch: "",
  loadIgnoredBranches: "",
  color: "",
};

const fieldClassName =
  "w-full min-w-0 rounded-lg border border-input bg-background px-2.5 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function repoName(repo: string) {
  return repo.slice(repo.lastIndexOf("/") + 1).toLowerCase();
}

/** Saved settings first, then repos from the current PRs that have none yet. */
function initialRows(settings: RepoSettings[], knownRepos: string[]): DraftRow[] {
  const rows: DraftRow[] = settings.map((entry) => ({
    repo: entry.repo,
    names: entry.names.join(", "),
    ignoredPaths: entry.ignoredPaths.join("\n"),
    targetBranch: entry.targetBranch ?? "",
    integrationBranch: entry.integrationBranch ?? "",
    loadIgnoredBranches: (entry.loadIgnoredBranches ?? []).join(", "),
    color: entry.color ?? "",
  }));
  const seen = new Set(rows.map((row) => repoName(row.repo)));
  for (const repo of [...knownRepos].sort((a, b) => a.localeCompare(b))) {
    if (seen.has(repoName(repo))) continue;
    seen.add(repoName(repo));
    rows.push({ repo, ...EMPTY_FIELDS });
  }
  return rows;
}

function toSettings(rows: DraftRow[]): RepoSettings[] {
  return rows.flatMap((row) => {
    const names = parseAliasNames(row.names);
    const ignoredPaths = parseIgnoredPaths(row.ignoredPaths);
    const targetBranch = parseBranchName(row.targetBranch);
    const integrationBranch = parseBranchName(row.integrationBranch);
    const color = parseColor(row.color);
    const loadIgnoredBranches = parseBranchList(row.loadIgnoredBranches);
    if (
      names.length === 0 &&
      ignoredPaths.length === 0 &&
      !targetBranch &&
      !integrationBranch &&
      !color &&
      loadIgnoredBranches.length === 0
    ) {
      return [];
    }
    return [
      {
        repo: row.repo.trim(),
        names,
        ignoredPaths,
        ...(targetBranch ? { targetBranch } : {}),
        ...(integrationBranch ? { integrationBranch } : {}),
        ...(color ? { color } : {}),
        ...(loadIgnoredBranches.length > 0 ? { loadIgnoredBranches } : {}),
      },
    ];
  });
}

export function RepoSettingsPage({
  settings,
  knownRepos,
  onSave,
  onCancel,
}: {
  settings: RepoSettings[];
  /** `owner/name` of repos in the current PR list, offered as empty rows. */
  knownRepos: string[];
  onSave: (settings: RepoSettings[]) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState(() => initialRows(settings, knownRepos));
  const [newRepo, setNewRepo] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  function update(index: number, patch: Partial<DraftRow>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function addRepo() {
    const repo = newRepo.trim();
    if (!isValidRepoName(repo)) {
      setAddError("Use a repo name like my-repo or owner/my-repo.");
      return;
    }
    if (rows.some((row) => repoName(row.repo) === repoName(repo))) {
      setAddError("That repo is already listed.");
      return;
    }
    setRows((current) => [...current, { repo, ...EMPTY_FIELDS }]);
    setNewRepo("");
    setAddError(null);
  }

  return (
    <main className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <h1 className="font-heading text-2xl font-medium">Repo settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Names, branches and diff-count rules per repo. Saved in this browser
          only.
        </p>

        <dl className="mt-6 grid gap-x-6 gap-y-3 text-xs text-muted-foreground sm:grid-cols-2">
          <div>
            <dt className="font-medium text-foreground">Aliases</dt>
            <dd className="mt-0.5 leading-snug">
              The first name is the repo&apos;s badge; pick its colour next to
              the repo name. Add more names after a comma (
              <code className="text-[11px]">AG, agents</code>) to treat them as
              the same repo.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Target branch</dt>
            <dd className="mt-0.5 leading-snug">
              The branch PRs ultimately merge into. Pending reviews and To review
              only count PRs aimed at it, directly or through a stack. Leave
              empty to use the repo&apos;s default branch on GitHub.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Integration branch</dt>
            <dd className="mt-0.5 leading-snug">
              The branch work lands on before release. My PRs shows whether each
              PR&apos;s latest commit is already on it. Defaults to{" "}
              <code className="text-[11px]">{DEFAULT_INTEGRATION_BRANCH}</code>.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Not counted as review load</dt>
            <dd className="mt-0.5 leading-snug">
              Reviews on PRs into these branches don&apos;t count toward
              Pending reviews&apos; 7-day review load, e.g.{" "}
              <code className="text-[11px]">production</code> for release PRs.
              Comma-separated.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Excluded from diff counts</dt>
            <dd className="mt-0.5 leading-snug">
              Files matching these globs don&apos;t count toward line and file
              totals. One per line, e.g.{" "}
              <code className="text-[11px]">**/translations.*.json</code> or{" "}
              <code className="text-[11px]">*.lock</code>. A leading{" "}
              <code className="text-[11px]">/</code> anchors to the repo root.
            </dd>
          </div>
        </dl>

        <Card className="mt-4 gap-0 divide-y p-0">
          {rows.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              No repos yet. Add one below.
            </p>
          ) : null}
          {rows.map((row, index) => (
            <div key={row.repo} className="space-y-2 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
              <RepoLabel repo={row.repo} />
              <ColorField
                repo={row.repo}
                label={parseAliasNames(row.names)[0]}
                color={row.color}
                onChange={(color) => update(index, { color })}
              />
            </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <Field label="Aliases">
                  <input
                    aria-label={`Aliases for ${row.repo}`}
                    placeholder="e.g. FE"
                    spellCheck={false}
                    autoComplete="off"
                    value={row.names}
                    onChange={(event) => update(index, { names: event.target.value })}
                    className={`${fieldClassName} h-8`}
                  />
                </Field>
                <Field label="Target branch">
                  <input
                    aria-label={`Target branch for ${row.repo}`}
                    placeholder="GitHub default"
                    spellCheck={false}
                    autoComplete="off"
                    value={row.targetBranch}
                    onChange={(event) =>
                      update(index, { targetBranch: event.target.value })
                    }
                    className={`${fieldClassName} h-8`}
                  />
                </Field>
                <Field label="Integration branch">
                  <input
                    aria-label={`Integration branch for ${row.repo}`}
                    placeholder={DEFAULT_INTEGRATION_BRANCH}
                    spellCheck={false}
                    autoComplete="off"
                    value={row.integrationBranch}
                    onChange={(event) =>
                      update(index, { integrationBranch: event.target.value })
                    }
                    className={`${fieldClassName} h-8`}
                  />
                </Field>
              </div>
              <Field label="Not counted as review load">
                <input
                  aria-label={`Branches not counted as review load for ${row.repo}`}
                  placeholder="e.g. production"
                  spellCheck={false}
                  autoComplete="off"
                  value={row.loadIgnoredBranches}
                  onChange={(event) =>
                    update(index, { loadIgnoredBranches: event.target.value })
                  }
                  className={`${fieldClassName} h-8`}
                />
              </Field>
              <Field label="Excluded from diff counts">
                <textarea
                  aria-label={`Excluded paths for ${row.repo}`}
                  placeholder="**/translations.*.json"
                  spellCheck={false}
                  rows={Math.max(1, row.ignoredPaths.split("\n").length)}
                  value={row.ignoredPaths}
                  onChange={(event) =>
                    update(index, { ignoredPaths: event.target.value })
                  }
                  className={`${fieldClassName} resize-y py-1.5 leading-5`}
                />
              </Field>
            </div>
          ))}
          <form
            className="space-y-1.5 px-4 py-3"
            onSubmit={(event) => {
              event.preventDefault();
              addRepo();
            }}
          >
            <div className="flex gap-2">
              <input
                aria-label="Repo to add"
                placeholder="Add a repo, e.g. owner/my-repo"
                spellCheck={false}
                autoComplete="off"
                value={newRepo}
                onChange={(event) => setNewRepo(event.target.value)}
                className={`${fieldClassName} h-8 flex-1`}
              />
              <Button type="submit" variant="outline" size="sm" disabled={!newRepo.trim()}>
                Add
              </Button>
            </div>
            {addError ? <p className="text-xs text-destructive">{addError}</p> : null}
          </form>
        </Card>

        <div className="mt-6 flex items-center gap-2">
          <Button type="button" onClick={() => onSave(toSettings(rows))}>
            Save
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </main>
  );
}

/** Badge preview plus a native colour picker; "Default" returns to the palette colour. */
function ColorField({
  repo,
  label,
  color,
  onChange,
}: {
  repo: string;
  label: string | undefined;
  color: string;
  onChange: (color: string) => void;
}) {
  const name = repo.slice(repo.lastIndexOf("/") + 1);
  const effective = color || repoColor(name);
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span
        style={{ "--repo-color": effective } as React.CSSProperties}
        className={`${REPO_BADGE_CLASS} inline-flex min-w-[1.75rem] items-center justify-center rounded px-1 py-0.5 text-[10px] leading-none font-semibold`}
      >
        {label ?? twoLetterRepoLabel(name)}
      </span>
      <input
        type="color"
        aria-label={`Badge colour for ${repo}`}
        value={effective}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 w-9 cursor-pointer rounded-md border border-input bg-background p-0.5"
      />
      {color ? (
        <Button type="button" variant="ghost" size="xs" onClick={() => onChange("")}>
          Default
        </Button>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function RepoLabel({ repo }: { repo: string }) {
  const slash = repo.lastIndexOf("/");
  const owner = slash >= 0 ? repo.slice(0, slash) : null;
  return (
    <p className="truncate font-mono text-xs" title={repo}>
      {owner ? <span className="text-muted-foreground">{owner}/</span> : null}
      <span className="font-medium">{repo.slice(slash + 1)}</span>
    </p>
  );
}
