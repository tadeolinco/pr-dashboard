import { RepoBadge, repositoryNameFromFullName } from "@/components/repo-badge";
import { SortableTableHead } from "@/components/sortable-table-head";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApp } from "@/lib/app-context";
import { RelativeTime } from "@/components/relative-time";
import { formatCount, formatLocalDateTime } from "@/lib/format";
import { AppLink } from "@/lib/navigation";
import {
  DEFAULT_PENDING_REVIEWS_SORT,
  defaultPendingReviewsSortDirection,
  sortPendingReviewers,
  type PendingReviewsSortKey,
  type PendingReviewsSortState,
} from "@/lib/pending-reviews-table-sort";
import {
  applyPendingReviewsActivityFilter,
  pendingReviewsSummaryFromReviewers,
} from "@/lib/pending-reviews/activity-filter";
import {
  loadPendingReviews,
  refreshPendingReviews,
  type PendingReviewsPayload,
} from "@/lib/pending-reviews/api";
import {
  reportGeneratedAtMs,
  type PendingReviewsTarget,
} from "@/lib/pending-reviews/cache";
import { combinedDiffLines } from "@/lib/pending-reviews/combined-diff";
import { showPendingReviewsTableRow } from "@/lib/pending-reviews/roster";
import type {
  PendingReviewsReport,
  PendingReviewsReviewer,
} from "@/lib/pending-reviews/types";
import { scopeOrganizations } from "@/lib/scope";
import { PENDING_REVIEWS_COLUMN_TOOLTIPS } from "@/lib/table-column-tooltips";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function PendingReviewsPanel() {
  const { config } = useApp();
  const orgs = scopeOrganizations(config.scope);
  const [selectedLogin, setSelectedLogin] = useState<string | null>(null);
  const org = orgs.find((entry) => entry.login === selectedLogin) ?? orgs[0];
  const targetKey = org ? `${org.login}:${org.repos?.join(",") ?? "*"}` : "";
  const target = useMemo<PendingReviewsTarget | null>(
    () => (org ? { org: org.login, repos: org.repos } : null),
    // targetKey captures org.login and org.repos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targetKey],
  );

  if (!org || !target) {
    return (
      <div className="rounded-lg border border-dashed px-6 py-10 text-center text-sm">
        <p className="font-medium">No organization selected</p>
        <p className="mt-1 text-muted-foreground">
          Pending reviews tallies review load across an organization&apos;s
          members. Add an organization under Settings → Orgs &amp; repos.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {orgs.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {orgs.map((entry) => (
            <button
              key={entry.login}
              type="button"
              onClick={() => setSelectedLogin(entry.login)}
              aria-pressed={entry.login === org.login}
              className={cn(
                "inline-flex h-6 items-center rounded-full border px-2 text-xs font-medium transition-colors",
                entry.login === org.login
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {entry.login}
            </button>
          ))}
        </div>
      ) : null}
      <OrgPendingReviews key={targetKey} target={target} />
    </div>
  );
}

function OrgPendingReviews({ target }: { target: PendingReviewsTarget }) {
  const [payload, setPayload] = useState<PendingReviewsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sort, setSort] = useState<PendingReviewsSortState>(
    DEFAULT_PENDING_REVIEWS_SORT,
  );
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const autoRefreshAttempted = useRef(false);

  const loadCache = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = loadPendingReviews(target);
      setPayload(data);
      if (data.error) setError(data.error);
    } catch {
      setError("Could not load pending review tally");
    } finally {
      setLoading(false);
    }
  }, [target]);

  useEffect(() => {
    void loadCache();
  }, [loadCache]);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      const data = await refreshPendingReviews(target);
      setPayload(data);
      setError(data.error ?? null);
    } catch {
      setError("Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (loading || refreshing || autoRefreshAttempted.current) return;
    if (!payload) return;
    if (payload.report && payload.fresh) return;
    autoRefreshAttempted.current = true;
    void refresh();
  }, [loading, payload, refreshing]);

  const report = payload?.report;
  const { displayReviewers, hiddenPrCount, displaySummary } = useMemo(() => {
    if (!report) {
      return {
        displayReviewers: [] as PendingReviewsReviewer[],
        hiddenPrCount: 0,
        displaySummary: null,
      };
    }
    const { reviewers, hiddenPrCount } = applyPendingReviewsActivityFilter(
      report.reviewers,
      showAll,
    );
    return {
      displayReviewers: reviewers,
      hiddenPrCount,
      displaySummary: pendingReviewsSummaryFromReviewers(reviewers),
    };
  }, [report, showAll]);

  const tableReviewers = useMemo(() => {
    return sortPendingReviewers(
      displayReviewers.filter(showPendingReviewsTableRow),
      sort,
    );
  }, [displayReviewers, sort]);

  function toggleSort(key: PendingReviewsSortKey) {
    setSort((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }
      return { key, direction: defaultPendingReviewsSortDirection(key) };
    });
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>
          Open PRs on each repo&apos;s target branch (its GitHub default
          unless set in Repo settings) or stacked onto them, with a review
          request outstanding.{" "}
          <span className="text-foreground/80">7d</span> columns count distinct
          PRs you reviewed in the last 7 days (once per PR, not your own;
          per-repo search + review timestamps). PRs with no commits or human
          reviews in 30 days are hidden unless you choose Show all.{" "}
          <span className="text-foreground/80">Σ load</span> is pending + 7d
          reviewed diff (default sort). Click a column header to sort.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {report ? (
            <>
              <button
                type="button"
                onClick={() => setShowAll((current) => !current)}
                className={cn(
                  "inline-flex h-6 items-center rounded-full border px-2 text-xs font-medium transition-colors",
                  showAll
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                aria-pressed={showAll}
              >
                Show all
                {!showAll && hiddenPrCount > 0 ? (
                  <span className="ml-1.5 tabular-nums opacity-80">
                    +{formatCount(hiddenPrCount)} hidden
                  </span>
                ) : null}
              </button>
              <span>
                Updated {formatLocalDateTime(reportGeneratedAtMs(report))}
                {!payload?.fresh ? " · stale" : ""}
              </span>
            </>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            <RefreshCw className={refreshing ? "animate-spin" : undefined} />
            {refreshing ? "Scanning…" : "Refresh tally"}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {loading && !report ? (
        <p className="text-sm text-muted-foreground">Loading cached tally…</p>
      ) : null}

      {!loading && !report && !refreshing ? (
        <div className="rounded-lg border border-dashed px-6 py-10 text-center text-sm">
          <p className="font-medium">No cached tally yet</p>
          <p className="mt-1 text-muted-foreground">
            First scan walks every {target.repos ? "selected" : "org"} repo in{" "}
            {target.org} and can take 1–2 minutes.
          </p>
          <Button className="mt-4" size="sm" onClick={() => void refresh()}>
            Run scan
          </Button>
        </div>
      ) : null}

      {report ? (
        <>
          <div className="min-h-0 flex-1 overflow-auto rounded-lg ring-1 ring-foreground/10 scrollbar-gutter-stable">
            <Table className="table-fixed text-xs">
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b bg-background shadow-[0_1px_0_0_var(--border)] [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-background">
                  <TableHead className="w-8" />
                  <SortableTableHead
                    label="Reviewer"
                    sortKey="login"
                    sort={sort}
                    onSort={toggleSort}
                    className="min-w-0"
                    tooltip={PENDING_REVIEWS_COLUMN_TOOLTIPS.login}
                  />
                  <SortableTableHead
                    label="PRs"
                    sortKey="count"
                    sort={sort}
                    onSort={toggleSort}
                    align="right"
                    className="w-12"
                    tooltip={PENDING_REVIEWS_COLUMN_TOOLTIPS.count}
                  />
                  <SortableTableHead
                    label="+lines"
                    sortKey="additions"
                    sort={sort}
                    onSort={toggleSort}
                    align="right"
                    className="w-16"
                    tooltip={PENDING_REVIEWS_COLUMN_TOOLTIPS.additions}
                  />
                  <SortableTableHead
                    label="−lines"
                    sortKey="deletions"
                    sort={sort}
                    onSort={toggleSort}
                    align="right"
                    className="w-16"
                    tooltip={PENDING_REVIEWS_COLUMN_TOOLTIPS.deletions}
                  />
                  <SortableTableHead
                    label="Σ diff"
                    sortKey="total_diff_lines"
                    sort={sort}
                    onSort={toggleSort}
                    align="right"
                    className="w-16"
                    tooltip={PENDING_REVIEWS_COLUMN_TOOLTIPS.total_diff_lines}
                  />
                  <SortableTableHead
                    label="files"
                    sortKey="changed_files"
                    sort={sort}
                    onSort={toggleSort}
                    align="right"
                    className="w-14"
                    tooltip={PENDING_REVIEWS_COLUMN_TOOLTIPS.changed_files}
                  />
                  <SortableTableHead
                    label="7d #"
                    sortKey="recent_review_count"
                    sort={sort}
                    onSort={toggleSort}
                    align="right"
                    className="w-12"
                    tooltip={
                      PENDING_REVIEWS_COLUMN_TOOLTIPS.recent_review_count
                    }
                  />
                  <SortableTableHead
                    label="7d Σ"
                    sortKey="recent_review_diff_lines"
                    sort={sort}
                    onSort={toggleSort}
                    align="right"
                    className="w-16"
                    tooltip={
                      PENDING_REVIEWS_COLUMN_TOOLTIPS.recent_review_diff_lines
                    }
                  />
                  <SortableTableHead
                    label="Σ load"
                    sortKey="combined_diff_lines"
                    sort={sort}
                    onSort={toggleSort}
                    align="right"
                    className="w-[4.25rem]"
                    tooltip={
                      PENDING_REVIEWS_COLUMN_TOOLTIPS.combined_diff_lines
                    }
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableReviewers.map((row) => (
                  <ReviewerRows
                    key={row.login}
                    row={row}
                    expanded={expanded === row.login}
                    onToggle={() =>
                      setExpanded((current) =>
                        current === row.login ? null : row.login,
                      )
                    }
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          <SummaryFooter
            summary={displaySummary ?? report.summary}
            hiddenPrCount={showAll ? 0 : hiddenPrCount}
          />
        </>
      ) : null}

      {refreshing && !report ? (
        <p className="text-sm text-muted-foreground">
          Scanning org repos for review requests…
        </p>
      ) : null}
    </div>
  );
}

function ReviewerRows({
  row,
  expanded,
  onToggle,
}: {
  row: PendingReviewsReviewer;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell className="py-1 text-muted-foreground">
          <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
            {expanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </span>
        </TableCell>
        <TableCell className="min-w-0 py-1 font-medium">
          <span className="flex min-w-0 items-center gap-2">
            <UserAvatar login={row.login} avatarUrl={row.avatar_url} />
            <span className="truncate">{row.login}</span>
          </span>
        </TableCell>
        <TableCell className="py-1 text-right font-mono tabular-nums">
          {row.count}
        </TableCell>
        <TableCell className="py-1 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
          {formatCount(row.total_additions)}
        </TableCell>
        <TableCell className="py-1 text-right font-mono tabular-nums text-red-600 dark:text-red-400">
          {formatCount(row.total_deletions)}
        </TableCell>
        <TableCell className="py-1 text-right font-mono tabular-nums">
          {formatCount(row.total_diff_lines)}
        </TableCell>
        <TableCell className="py-1 text-right font-mono tabular-nums text-muted-foreground">
          {formatCount(row.total_changed_files)}
        </TableCell>
        <TableCell className="py-1 text-right font-mono tabular-nums text-muted-foreground">
          {formatCount(row.recent_review_count ?? 0)}
        </TableCell>
        <TableCell
          className={cn(
            "py-1 text-right font-mono tabular-nums",
            (row.recent_review_diff_lines ?? 0) > 0 &&
              "text-amber-700 dark:text-amber-400",
          )}
        >
          {formatCount(row.recent_review_diff_lines ?? 0)}
        </TableCell>
        <TableCell className="py-1 text-right font-mono tabular-nums font-semibold">
          {formatCount(row.combined_diff_lines ?? combinedDiffLines(row))}
        </TableCell>
      </TableRow>
      {expanded
        ? row.prs.map((pr) => (
            <TableRow
              key={`${pr.repo_full}#${pr.number}`}
              className="bg-muted/30"
            >
              <TableCell />
              <TableCell className="min-w-0 py-1 whitespace-normal">
                <p className="font-medium leading-snug">
                  <AppLink
                    href={pr.url}
                    className="hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {pr.title}
                  </AppLink>
                  {pr.author_login ? (
                    <>
                      {" · "}
                      <span className="inline-flex max-w-full align-middle items-center gap-1 text-[10px] font-normal leading-tight text-muted-foreground">
                        <UserAvatar
                          login={pr.author_login}
                          avatarUrl={pr.author_avatar_url}
                          className="!size-3.5"
                          fallbackClassName="text-[7px]"
                          imageSize={28}
                        />
                        <span>{pr.author_login}</span>
                      </span>
                    </>
                  ) : null}
                </p>
                <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-muted-foreground">
                  <RepoBadge
                    repositoryName={repositoryNameFromFullName(pr.repo_full)}
                    nameWithOwner={pr.repo_full}
                    className="align-middle"
                  />
                  <AppLink
                    href={pr.url}
                    className="font-mono tabular-nums hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    #{pr.number}
                  </AppLink>
                  {pr.stack_parent ? (
                    <>
                      {" "}
                      · onto{" "}
                      <AppLink
                        href={pr.stack_parent.url}
                        className="hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        #{pr.stack_parent.number}
                      </AppLink>
                    </>
                  ) : null}
                </p>
              </TableCell>
              <TableCell className="py-1" />
              <TableCell className="py-1 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                +{formatCount(pr.additions)}
              </TableCell>
              <TableCell className="py-1 text-right font-mono tabular-nums text-red-600 dark:text-red-400">
                −{formatCount(pr.deletions)}
              </TableCell>
              <TableCell className="py-1 text-right font-mono tabular-nums">
                {formatCount(pr.diff_lines)}
              </TableCell>
              <TableCell className="py-1 text-right font-mono tabular-nums text-muted-foreground">
                {formatCount(pr.changed_files)}
              </TableCell>
              <TableCell className="py-1" colSpan={3} />
            </TableRow>
          ))
        : null}
      {expanded
        ? (row.recent_reviews ?? []).map((review) => (
            <TableRow
              key={`recent-${review.repo_full}#${review.number}-${review.submitted_at}`}
              className="bg-amber-500/5"
            >
              <TableCell />
              <TableCell className="min-w-0 py-1 whitespace-normal">
                <p className="font-medium leading-snug">
                  <AppLink
                    href={review.url}
                    className="hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {review.title}
                  </AppLink>
                  {review.author_login ? (
                    <>
                      {" · "}
                      <span className="inline-flex max-w-full align-middle items-center gap-1 text-[10px] font-normal leading-tight text-muted-foreground">
                        <UserAvatar
                          login={review.author_login}
                          avatarUrl={review.author_avatar_url}
                          className="!size-3.5"
                          fallbackClassName="text-[7px]"
                          imageSize={28}
                        />
                        <span>{review.author_login}</span>
                      </span>
                    </>
                  ) : null}
                </p>
                <p className="text-muted-foreground">
                  <span className="text-amber-800/80 dark:text-amber-400/90">
                    reviewed
                  </span>
                  {" · "}
                  <RepoBadge
                    repositoryName={repositoryNameFromFullName(
                      review.repo_full,
                    )}
                    nameWithOwner={review.repo_full}
                    className="align-middle"
                  />
                  <AppLink
                    href={review.url}
                    className="font-mono tabular-nums hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    #{review.number}
                  </AppLink>
                  {" · "}
                  <RelativeTime iso={review.submitted_at} />
                  {review.state ? (
                    <>
                      {" · "}
                      <span className="font-mono text-[10px] uppercase">
                        {review.state.replace(/_/g, " ")}
                      </span>
                    </>
                  ) : null}
                </p>
              </TableCell>
              <TableCell className="py-1" />
              <TableCell className="py-1 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                +{formatCount(review.additions)}
              </TableCell>
              <TableCell className="py-1 text-right font-mono tabular-nums text-red-600 dark:text-red-400">
                −{formatCount(review.deletions)}
              </TableCell>
              <TableCell className="py-1 text-right font-mono tabular-nums">
                {formatCount(review.diff_lines)}
              </TableCell>
              <TableCell className="py-1 text-right font-mono tabular-nums text-muted-foreground">
                {formatCount(review.changed_files)}
              </TableCell>
              <TableCell className="py-1" colSpan={3} />
            </TableRow>
          ))
        : null}
    </>
  );
}

function githubAvatarUrl(login: string, size = 40) {
  return `https://github.com/${encodeURIComponent(login)}.png?size=${size}`;
}

function UserAvatar({
  login,
  avatarUrl,
  className = "!size-5",
  fallbackClassName = "text-[9px]",
  imageSize = 40,
}: {
  login: string;
  avatarUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
  imageSize?: number;
}) {
  const src = avatarUrl ?? githubAvatarUrl(login, imageSize);
  return (
    <Avatar className={cn("shrink-0", className)}>
      <AvatarImage src={src} alt="" />
      <AvatarFallback className={cn("text-sm", fallbackClassName)}>
        {login.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

function SummaryFooter({
  summary,
  hiddenPrCount,
}: {
  summary: PendingReviewsReport["summary"];
  hiddenPrCount: number;
}) {
  return (
    <div className="space-y-2 text-xs text-muted-foreground">
      <p>
        <span className="font-medium text-foreground">Totals:</span>{" "}
        {formatCount(summary.sum_of_pending_rows)} pending rows across{" "}
        {formatCount(summary.reviewer_rows_with_pending)} reviewers · Σ diff{" "}
        {formatCount(summary.sum_of_diff_lines)} ·{" "}
        {formatCount(summary.unique_prs)} unique PRs (same PR counts once per
        requested reviewer).
        {summary.sum_of_recent_review_diff_lines != null ? (
          <>
            {" "}
            · 7d reviewed Σ diff{" "}
            {formatCount(summary.sum_of_recent_review_diff_lines)} (org-wide,
            all members).
          </>
        ) : null}
        {hiddenPrCount > 0 ? (
          <>
            {" "}
            · Hiding {formatCount(hiddenPrCount)} with no commits or human
            reviews in 30 days (toggle Show all).
          </>
        ) : null}
      </p>
    </div>
  );
}
