import {
  dashboardHref,
  linkedGroupIdsWithStatus,
  linkedMergedPullRequests,
  type DashboardFilters,
} from "@/lib/filters";
import { formatCount } from "@/lib/format";
import { AppLink } from "@/lib/navigation";
import { countMultiLinkedPullRequests } from "@/lib/pr-links";
import { STATUS_LABELS } from "@/lib/pr-status";
import type { PullRequest, ReviewStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Search, X } from "lucide-react";
import { useEffect, useRef } from "react";

const STATUS_CHIPS: ReviewStatus[] = [
  "awaiting_reviewer",
  "review_requested",
  "commented",
  "changes_requested",
  "approved",
];

export function StatusFilters({
  pullRequests,
  mergedPullRequests,
  filters,
  search,
  onSearchChange,
}: {
  pullRequests: PullRequest[];
  /** Merged PRs linked from `pullRequests`; the Show merged chip needs them. */
  mergedPullRequests?: PullRequest[];
  filters: DashboardFilters;
  search: string;
  onSearchChange: (search: string) => void;
}) {
  const groupLinkedActive = filters.group === "linked";
  const linkedPrCount = countMultiLinkedPullRequests(pullRequests);
  const allActive =
    !groupLinkedActive &&
    !filters.session &&
    !filters.review &&
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
      {mergedPullRequests ? (
        <FilterChip
          href={dashboardHref({ ...filters, merged: !filters.merged })}
          active={Boolean(filters.merged)}
          label="Show merged"
          count={
            linkedMergedPullRequests(pullRequests, mergedPullRequests).length
          }
        />
      ) : null}
      {STATUS_CHIPS.map((status) => {
        const active = filters.status === status;
        const matchingGroups = groupLinkedActive
          ? linkedGroupIdsWithStatus(pullRequests, status)
          : null;
        return (
          <FilterChip
            key={status}
            href={dashboardHref({
              ...filters,
              status: active ? "all" : status,
              session: undefined,
              review: undefined,
            })}
            active={active}
            label={STATUS_LABELS[status]}
            count={
              pullRequests.filter(
                (pr) =>
                  pr.status === status ||
                  (pr.linkedGroupId !== null &&
                    matchingGroups?.has(pr.linkedGroupId)),
              ).length
            }
          />
        );
      })}
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
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl+F jumps here instead of the browser's find bar. Only the active
  // tab's field is mounted, so this always targets the visible one.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "f")
        return;
      if (event.shiftKey || event.altKey) return;
      const input = inputRef.current;
      if (!input) return;
      event.preventDefault();
      input.focus();
      input.select();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="relative ml-auto w-full sm:w-64">
      <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
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
