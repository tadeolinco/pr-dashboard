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

export function StatusFilters({
  pullRequests,
  filters,
  showLocalSessionFilters = true,
}: {
  pullRequests: PullRequest[];
  filters: DashboardFilters;
  showLocalSessionFilters?: boolean;
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
    <div className="flex flex-wrap gap-2">
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
