import { DashboardTabs } from "@/components/dashboard-tabs";
import { PrTableWithChecks } from "@/components/pr-table-with-checks";
import { ReviewQueueTab } from "@/components/review-queue-tab";
import { StatusFilters } from "@/components/status-filters";
import { useApp } from "@/lib/app-context";
import {
  filterPullRequests,
  withoutLocalSessionFilters,
  type DashboardFilters,
} from "@/lib/filters";
import type { DashboardData } from "@/lib/types";
import { GitPullRequest } from "lucide-react";

export function Dashboard({
  data,
  filters,
}: {
  data: DashboardData;
  filters: DashboardFilters;
}) {
  const { config } = useApp();
  const tableFilters = config.localDocsIntegration
    ? filters
    : withoutLocalSessionFilters(filters);
  const scoped = filters.repo
    ? data.pullRequests.filter(
        (pr) => pr.repository.nameWithOwner === filters.repo,
      )
    : data.pullRequests;
  const visible = filterPullRequests(data.pullRequests, tableFilters);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col px-4 py-4 lg:px-6">
      <DashboardTabs
        filters={filters}
        myPrs={
          <>
            <StatusFilters
              pullRequests={scoped}
              filters={filters}
              showLocalSessionFilters={config.localDocsIntegration}
            />
            {visible.length === 0 ? (
              <EmptyFilter message="No pull requests match" />
            ) : (
              <div className="min-h-0 flex-1 overflow-auto rounded-lg ring-1 ring-foreground/10">
                <PrTableWithChecks pullRequests={visible} filters={filters} />
              </div>
            )}
          </>
        }
        myReviewQueue={
          <ReviewQueueTab viewerLogin={data.viewer.login} filters={filters} />
        }
      />
    </div>
  );
}

function EmptyFilter({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center">
      <GitPullRequest className="mb-2 size-5 text-muted-foreground" />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}
