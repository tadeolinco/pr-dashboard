import { dashboardHref, type DashboardFilters } from "@/lib/filters";
import { formatCount } from "@/lib/format";
import { AppLink } from "@/lib/navigation";
import { countMultiLinkedPullRequests } from "@/lib/pr-links";
import { STATUS_LABELS } from "@/lib/pr-status";
import {
  isNotCleanReview,
  isStaleReview,
} from "@/lib/review-session/pr-health";
import type { PullRequest } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Search, X } from "lucide-react";

export function StatusFilters({
  pullRequests,
  filters,
  showLocalSessionFilters = true,
  search,
  onSearchChange,
}: {
  pullRequests: PullRequest[];
  filters: DashboardFilters;
  showLocalSessionFilters?: boolean;
  search: string;
  onSearchChange: (search: string) => void;
}) {
  const needsReviewerActive = filters.status === "awaiting_reviewer";
  const staleActive = filters.review === "stale";
  const notCleanActive = filters.review === "not-clean";
  const groupLinkedActive = filters.group === "linked";
  const linkedPrCount = countMultiLinkedPullRequests(pullRequests);
  const allActive =
    !needsReviewerActive &&
    !staleActive &&
    !notCleanActive &&
    !groupLinkedActive &&
    !filters.session &&
    (!filters.status || filters.status === "all");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterChip
        href={dashboardHref({
          ...filters,
          status: "all",
          session: undefined,
          review: undefined,
          group: undefined,
        })}
        active={allActive}
        label="All"
        count={pullRequests.length}
      />
      <FilterChip
        href={dashboardHref({
          ...filters,
          group: groupLinkedActive ? "flat" : "linked",
        })}
        active={groupLinkedActive}
        label="Group linked"
        count={linkedPrCount}
      />
      <FilterChip
        href={dashboardHref({
          ...filters,
          status: needsReviewerActive ? "all" : "awaiting_reviewer",
          session: undefined,
          review: undefined,
        })}
        active={needsReviewerActive}
        label={STATUS_LABELS.awaiting_reviewer}
        count={
          pullRequests.filter((pr) => pr.status === "awaiting_reviewer").length
        }
      />
      {showLocalSessionFilters ? (
        <>
          <FilterChip
            href={dashboardHref({
              ...filters,
              status: notCleanActive ? filters.status : "all",
              session: undefined,
              review: notCleanActive ? undefined : "not-clean",
            })}
            active={notCleanActive}
            label="Not clean"
            count={pullRequests.filter(isNotCleanReview).length}
          />
          <FilterChip
            href={dashboardHref({
              ...filters,
              status: staleActive ? filters.status : "all",
              session: undefined,
              review: staleActive ? undefined : "stale",
            })}
            active={staleActive}
            label="Stale"
            count={pullRequests.filter(isStaleReview).length}
          />
        </>
      ) : null}
      <SearchField value={search} onChange={onSearchChange} />
    </div>
  );
}

function SearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative ml-auto w-full sm:w-64">
      <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        aria-label="Search pull requests"
        placeholder="Search title, #, repo, branch, author"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onChange("");
        }}
        className="h-7 w-full rounded-lg border border-input bg-background pr-7 pl-7 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function FilterChip({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <AppLink
      href={href}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-xs font-medium transition-colors",
        active
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
      <span
        className={cn("tabular-nums", active ? "opacity-80" : "opacity-70")}
      >
        {formatCount(count)}
      </span>
    </AppLink>
  );
}
