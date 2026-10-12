import { DashboardTabs } from "@/components/dashboard-tabs";
import { PrTableWithChecks } from "@/components/pr-table-with-checks";
import { ReviewQueueTab, useReviewQueue } from "@/components/review-queue-tab";
import { StatusFilters } from "@/components/status-filters";
import { useApp } from "@/lib/app-context";
import {
  filterPullRequests,
  searchPullRequests,
  withoutLocalSessionFilters,
  type DashboardFilters,
} from "@/lib/filters";
import type { DashboardData } from "@/lib/types";
import { GitPullRequest } from "lucide-react";
import { useState } from "react";

export function Dashboard({
  data,
  filters,
}: {
  data: DashboardData;
  filters: DashboardFilters;
}) {
  const { config } = useApp();
  // One search per tab, kept here so it survives switching tabs.
  const [myPrsSearch, setMyPrsSearch] = useState("");
  const [reviewQueueSearch, setReviewQueueSearch] = useState("");
  const searched = searchPullRequests(data.pullRequests, myPrsSearch);
  const tableFilters = config.localDocsIntegration
    ? filters
    : withoutLocalSessionFilters(filters);
  const scoped = filters.repo
    ? searched.filter((pr) => pr.repository.nameWithOwner === filters.repo)
    : searched;
  const visible = filterPullRequests(searched, tableFilters);
  const reviewQueue = useReviewQueue(data.viewer.login);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col px-4 py-4 lg:px-6">
      <DashboardTabs
        filters={filters}
        myPrsCount={data.pullRequests.length}
        myReviewQueueCount={reviewQueue?.length ?? null}
        myPrs={
          <>
            <StatusFilters
              pullRequests={scoped}
              filters={filters}
              showLocalSessionFilters={config.localDocsIntegration}
              search={myPrsSearch}
              onSearchChange={setMyPrsSearch}
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
          <ReviewQueueTab
            reviewQueue={reviewQueue}
            filters={filters}
            search={reviewQueueSearch}
            onSearchChange={setReviewQueueSearch}
          />
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
