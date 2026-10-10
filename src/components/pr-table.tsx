"use client";

import { RepoBadge } from "@/components/repo-badge";
import { SortableTableHead } from "@/components/sortable-table-head";
import { StatusBadge } from "@/components/status-badge";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useApp } from "@/lib/app-context";
import { dashboardHref, type DashboardFilters } from "@/lib/filters";
import { RelativeTime } from "@/components/relative-time";
import { formatCount } from "@/lib/format";
import { AppLink } from "@/lib/navigation";
import { baseSyncLabel, baseSyncTooltip } from "@/lib/pr-base-sync";
import {
  developmentSyncLabel,
  developmentSyncTooltip,
} from "@/lib/pr-development-sync";
import { integrationBranchForRepository } from "@/lib/repo-settings";
import { linkedGroupSize } from "@/lib/pr-links";
import { getVisibleReviewerLogins, hasHumanReviewer } from "@/lib/pr-status";
import { layoutPullRequestRows } from "@/lib/pr-table-layout";
import {
  DEFAULT_PR_SORT,
  defaultSortDirection,
  type PrSortKey,
  type PrSortState,
} from "@/lib/pr-table-sort";
import { cleanTooltip, hasReviewSession } from "@/lib/review-session/pr-health";
import { MY_PRS_COLUMN_TOOLTIPS } from "@/lib/table-column-tooltips";
import type {
  Actor,
  CheckStatus,
  PullRequest,
  TeamReviewer,
} from "@/lib/types";
import { useEffect, useMemo, useState } from "react";

const LOCAL_SESSION_SORT_KEYS = new Set<PrSortKey>([
  "review",
  "clean",
  "stale",
  "triage",
]);

export function PrTable({
  pullRequests,
  filters,
  checksLoading = false,
  checksFailed = false,
  developmentSyncLoading = false,
  developmentSyncFailed = false,
  hideReviewers = false,
}: {
  pullRequests: PullRequest[];
  filters: DashboardFilters;
  checksLoading?: boolean;
  checksFailed?: boolean;
  developmentSyncLoading?: boolean;
  developmentSyncFailed?: boolean;
  hideReviewers?: boolean;
}) {
  const { config } = useApp();
  const hideLocalSessionColumns = !config.localDocsIntegration;
  const [sort, setSort] = useState<PrSortState>(DEFAULT_PR_SORT);

  useEffect(() => {
    if (hideLocalSessionColumns && LOCAL_SESSION_SORT_KEYS.has(sort.key)) {
      setSort(DEFAULT_PR_SORT);
    }
  }, [hideLocalSessionColumns, sort.key]);

  const groupLinked = filters.group === "linked";
  const columnCount =
    (hideReviewers ? 14 : 15) - (hideLocalSessionColumns ? 4 : 0);

  const segments = useMemo(
    () => layoutPullRequestRows(pullRequests, sort, groupLinked),
    [pullRequests, sort, groupLinked],
  );

  function toggleSort(key: PrSortKey) {
    setSort((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }
      return { key, direction: defaultSortDirection(key) };
    });
  }

  return (
    <Table className="text-xs">
      <TableHeader>
        <TableRow className="hover:bg-transparent border-b bg-background shadow-[0_1px_0_0_var(--border)] [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-background">
          <SortableTableHead
            label="Repo"
            sortKey="repo"
            sort={sort}
            onSort={toggleSort}
            className="h-8 w-14"
            tooltip={MY_PRS_COLUMN_TOOLTIPS.repo}
          />
          <SortableTableHead
            label="#"
            sortKey="number"
            sort={sort}
            onSort={toggleSort}
            className="h-8 w-12 justify-end"
            align="right"
            ariaLabel="PR number"
            tooltip={MY_PRS_COLUMN_TOOLTIPS.number}
          />
          <SortableTableHead
            label="Title"
            sortKey="title"
            sort={sort}
            onSort={toggleSort}
            className="h-8"
            tooltip={MY_PRS_COLUMN_TOOLTIPS.title}
          />
          <SortableTableHead
            label="Status"
            sortKey="status"
            sort={sort}
            onSort={toggleSort}
            className="h-8"
            tooltip={MY_PRS_COLUMN_TOOLTIPS.status}
          />
          {hideReviewers ? null : (
            <SortableTableHead
              label=""
              sortKey="reviewers"
              sort={sort}
              onSort={toggleSort}
              className="h-8 w-[4.5rem]"
              ariaLabel="Reviewers"
              tooltip={MY_PRS_COLUMN_TOOLTIPS.reviewers}
            />
          )}
          <SortableTableHead
            label="Checks"
            sortKey="checks"
            sort={sort}
            onSort={toggleSort}
            className="h-8"
            tooltip={MY_PRS_COLUMN_TOOLTIPS.checks}
          />
          <SortableTableHead
            label="Behind"
            sortKey="behind"
            sort={sort}
            onSort={toggleSort}
            className="h-8 w-14"
            ariaLabel="Behind target branch"
            tooltip={MY_PRS_COLUMN_TOOLTIPS.behind}
          />
          <SortableTableHead
            label="Integrated"
            sortKey="inDev"
            sort={sort}
            onSort={toggleSort}
            className="h-8 w-16"
            ariaLabel="Head commit on integration branch"
            tooltip={MY_PRS_COLUMN_TOOLTIPS.inDev}
          />
          {hideLocalSessionColumns ? null : (
            <>
              <SortableTableHead
                label="Review"
                sortKey="review"
                sort={sort}
                onSort={toggleSort}
                className="h-8 w-10 justify-end"
                align="right"
                tooltip={MY_PRS_COLUMN_TOOLTIPS.review}
              />
              <SortableTableHead
                label="Clean"
                sortKey="clean"
                sort={sort}
                onSort={toggleSort}
                className="h-8 w-16"
                tooltip={MY_PRS_COLUMN_TOOLTIPS.clean}
              />
              <SortableTableHead
                label="Stale"
                sortKey="stale"
                sort={sort}
                onSort={toggleSort}
                className="h-8 w-14"
                tooltip={MY_PRS_COLUMN_TOOLTIPS.stale}
              />
              <SortableTableHead
                label="Triage"
                sortKey="triage"
                sort={sort}
                onSort={toggleSort}
                className="h-8 w-14"
                tooltip={MY_PRS_COLUMN_TOOLTIPS.triage}
              />
            </>
          )}
          <SortableTableHead
            label="Total"
            sortKey="total"
            sort={sort}
            onSort={toggleSort}
            className="h-8 w-14 justify-end"
            align="right"
            tooltip={MY_PRS_COLUMN_TOOLTIPS.total}
          />
          <SortableTableHead
            label="Created"
            sortKey="createdAt"
            sort={sort}
            onSort={toggleSort}
            className="h-8 justify-end"
            align="right"
            tooltip={MY_PRS_COLUMN_TOOLTIPS.createdAt}
          />
          <SortableTableHead
            label="Updated"
            sortKey="updatedAt"
            sort={sort}
            onSort={toggleSort}
            className="h-8 justify-end"
            align="right"
            tooltip={MY_PRS_COLUMN_TOOLTIPS.updatedAt}
          />
        </TableRow>
      </TableHeader>
      <TableBody>
        {segments.map((segment) => {
          if (segment.kind === "group-divider") {
            return (
              <LinkedGroupDividerRow
                key={`group-${segment.groupId}`}
                columnCount={columnCount}
              />
            );
          }

          const pr = segment.pullRequest;
          const inMultiLinkedGroup =
            groupLinked &&
            pr.linkedGroupId &&
            linkedGroupSize(pullRequests, pr.linkedGroupId) >= 2;
          return (
            <TableRow
              key={pr.id}
              className={
                inMultiLinkedGroup ? "bg-muted/20 hover:bg-muted/30" : undefined
              }
            >
              <TableCell className="py-1">
                <RepoBadge
                  repositoryName={pr.repository.name}
                  nameWithOwner={pr.repository.nameWithOwner}
                  href={dashboardHref({
                    ...filters,
                    repo:
                      filters.repo === pr.repository.nameWithOwner
                        ? undefined
                        : pr.repository.nameWithOwner,
                  })}
                />
              </TableCell>
              <TableCell className="w-12 py-1 text-right">
                <AppLink
                  href={pr.url}
                  className="font-mono tabular-nums text-muted-foreground hover:text-foreground hover:underline"
                >
                  {pr.number}
                </AppLink>
              </TableCell>
              <TableCell className="min-w-[12rem] py-1 whitespace-normal">
                <AppLink
                  href={pr.url}
                  title={pr.title}
                  className="line-clamp-1 font-medium hover:underline"
                >
                  {pr.title}
                </AppLink>
              </TableCell>
              <TableCell className="py-1">
                <StatusBadge status={pr.status} />
              </TableCell>
              {hideReviewers ? null : (
                <TableCell className="w-[4.5rem] py-1">
                  <ReviewersCell pullRequest={pr} />
                </TableCell>
              )}
              <TableCell className="py-1">
                <CheckCell
                  status={pr.checkStatus}
                  loading={checksLoading}
                  failed={checksFailed}
                />
              </TableCell>
              <TableCell className="py-1">
                <BehindTargetCell pullRequest={pr} />
              </TableCell>
              <TableCell className="py-1">
                <DevelopmentSyncCell
                  pullRequest={pr}
                  loading={developmentSyncLoading}
                  failed={developmentSyncFailed}
                />
              </TableCell>
              {hideLocalSessionColumns ? null : (
                <>
                  <TableCell className="w-10 py-1 text-right">
                    <ReviewCell pullRequest={pr} />
                  </TableCell>
                  <TableCell className="py-1">
                    <CleanCell pullRequest={pr} />
                  </TableCell>
                  <TableCell className="py-1">
                    <StaleCell pullRequest={pr} />
                  </TableCell>
                  <TableCell className="py-1">
                    <SessionCell done={pr.sessions.triage} />
                  </TableCell>
                </>
              )}
              <TableCell className="py-1 text-right font-mono tabular-nums text-muted-foreground">
                {formatCount(pr.additions + pr.deletions)}
              </TableCell>
              <TableCell className="py-1 text-right text-muted-foreground">
                <RelativeTime iso={pr.createdAt} />
              </TableCell>
              <TableCell className="py-1 text-right text-muted-foreground">
                <RelativeTime iso={pr.updatedAt} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function LinkedGroupDividerRow({ columnCount }: { columnCount: number }) {
  return (
    <TableRow className="border-0 hover:bg-transparent">
      <TableCell
        colSpan={columnCount}
        className="bg-border py-0.5 leading-none text-transparent select-none"
        aria-hidden
      >
        {"\u00a0"}
      </TableCell>
    </TableRow>
  );
}

function ReviewersCell({ pullRequest }: { pullRequest: PullRequest }) {
  if (!hasHumanReviewer(pullRequest)) {
    return <span className="text-amber-700 dark:text-amber-300">None</span>;
  }

  const { actors, teams } = getReviewerDisplay(pullRequest);
  if (actors.length === 0 && teams.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <AvatarGroup className="*:data-[slot=avatar]:size-5">
      {actors.map((actor) => (
        <Tooltip key={actor.login}>
          <TooltipTrigger asChild>
            <Avatar size="sm" className="size-5">
              {actor.avatarUrl ? (
                <AvatarImage src={actor.avatarUrl} alt="" />
              ) : null}
              <AvatarFallback className="text-[9px]">
                {actor.login.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent side="top">{actor.login}</TooltipContent>
        </Tooltip>
      ))}
      {teams.map((team) => (
        <TeamAvatar key={team.slug} team={team} />
      ))}
    </AvatarGroup>
  );
}

function TeamAvatar({ team }: { team: TeamReviewer }) {
  const label = team.name || team.slug;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Avatar size="sm" className="size-5">
          <AvatarFallback className="bg-muted text-[9px] text-muted-foreground">
            {teamInitials(team)}
          </AvatarFallback>
        </Avatar>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

function getReviewerDisplay(pullRequest: PullRequest): {
  actors: Actor[];
  teams: TeamReviewer[];
} {
  const visible = getVisibleReviewerLogins(pullRequest);
  const actors: Actor[] = uniqueActors([
    ...pullRequest.requestedReviewers,
    ...pullRequest.reviews.filter((review) => !review.isBot),
  ]);

  if (visible.size > 0 || pullRequest.requestedTeams.length > 0) {
    return {
      actors: actors.filter((actor) => visible.has(actor.login)),
      teams: pullRequest.requestedTeams,
    };
  }

  return { actors: [], teams: [] };
}

function teamInitials(team: TeamReviewer) {
  const words = (team.name || team.slug).split(/[\s-_]+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return (team.slug.slice(0, 2) || "??").toUpperCase();
}

function SessionCell({ done }: { done: boolean }) {
  if (done) {
    return <span className="text-emerald-700">Yes</span>;
  }
  return <span className="text-amber-700">No</span>;
}

function ReviewCell({ pullRequest }: { pullRequest: PullRequest }) {
  const round =
    pullRequest.reviewStatus.round > 0 ? pullRequest.reviewStatus.round : 0;
  const roundClass =
    round === 0
      ? "font-mono tabular-nums text-red-600 dark:text-red-400"
      : "font-mono tabular-nums text-muted-foreground";

  const sessionPath = pullRequest.reviewStatus.sessionPath;
  const count = <span className={roundClass}>{round}</span>;

  if (!sessionPath) {
    return count;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default">{count}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-md font-mono text-[10px]">
        {sessionPath}
      </TooltipContent>
    </Tooltip>
  );
}

function CleanCell({ pullRequest }: { pullRequest: PullRequest }) {
  if (!hasReviewSession(pullRequest)) {
    return <span className="text-muted-foreground">—</span>;
  }
  const clean = pullRequest.reviewStatus.clean;
  const tooltip = cleanTooltip(pullRequest.reviewStatus);

  let label: string;
  let className: string;
  if (clean === true) {
    label = "Yes";
    className = "text-emerald-700 dark:text-emerald-300";
  } else if (clean === false) {
    label = "No";
    className = "text-red-700 dark:text-red-300";
  } else {
    label = "?";
    className = "text-muted-foreground";
  }

  if (!tooltip) {
    return <span className={className}>{label}</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`cursor-default ${className}`}>{label}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-md">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function StaleCell({ pullRequest }: { pullRequest: PullRequest }) {
  if (!hasReviewSession(pullRequest)) {
    return <span className="text-muted-foreground">—</span>;
  }
  const stale = pullRequest.reviewStatus.stale;
  if (stale === true) {
    return <span className="text-amber-700 dark:text-amber-300">Yes</span>;
  }
  if (stale === false) {
    return <span className="text-emerald-700 dark:text-emerald-300">No</span>;
  }
  return <span className="text-muted-foreground">?</span>;
}

function DevelopmentSyncCell({
  pullRequest,
  loading,
  failed,
}: {
  pullRequest: PullRequest;
  loading?: boolean;
  failed?: boolean;
}) {
  if (loading) {
    return <span className="text-muted-foreground">…</span>;
  }
  if (failed && !pullRequest.developmentSync) {
    return (
      <span
        className="text-muted-foreground"
        title="Could not compare with the integration branch"
      >
        ?
      </span>
    );
  }

  const devBranch = integrationBranchForRepository(pullRequest.repository.name);
  const label = developmentSyncLabel(pullRequest.developmentSync);
  const tooltip = developmentSyncTooltip(
    pullRequest.developmentSync,
    devBranch,
    pullRequest.headRefName,
  );

  let content;
  switch (label) {
    case "yes":
      content = (
        <span className="text-emerald-700 dark:text-emerald-300">Yes</span>
      );
      break;
    case "no":
      content = <span className="text-amber-700 dark:text-amber-300">No</span>;
      break;
    case "na":
      content = <span className="text-muted-foreground">—</span>;
      break;
    default:
      content = <span className="text-muted-foreground">?</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default">{content}</span>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function BehindTargetCell({ pullRequest }: { pullRequest: PullRequest }) {
  const label = baseSyncLabel(pullRequest.mergeStateStatus);
  const tooltip = baseSyncTooltip(
    pullRequest.mergeStateStatus,
    pullRequest.baseRefName,
  );

  let content;
  switch (label) {
    case "yes":
      content = <span className="text-amber-700 dark:text-amber-300">Yes</span>;
      break;
    case "conflict":
      content = (
        <span className="text-red-700 dark:text-red-300">Conflict</span>
      );
      break;
    case "no":
      content = (
        <span className="text-emerald-700 dark:text-emerald-300">No</span>
      );
      break;
    default:
      content = <span className="text-muted-foreground">?</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default">{content}</span>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function CheckCell({
  status,
  loading,
  failed,
}: {
  status: CheckStatus;
  loading?: boolean;
  failed?: boolean;
}) {
  if (loading) {
    return <span className="text-muted-foreground">…</span>;
  }
  if (failed && !status) {
    return (
      <span className="text-muted-foreground" title="Could not load checks">
        ?
      </span>
    );
  }
  if (!status) return <span className="text-muted-foreground">—</span>;
  if (status === "SUCCESS") {
    return <span className="text-emerald-600 dark:text-emerald-400">Pass</span>;
  }
  if (status === "PENDING" || status === "EXPECTED") {
    return <span className="text-amber-600 dark:text-amber-400">Pending</span>;
  }
  return <span className="text-red-600 dark:text-red-400">Fail</span>;
}

function uniqueActors(actors: Actor[]) {
  const seen = new Set<string>();
  return actors.filter((actor) => {
    if (seen.has(actor.login)) return false;
    seen.add(actor.login);
    return true;
  });
}
