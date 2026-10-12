import { DashboardSkeleton } from "@/components/dashboard-skeleton";
import { PrTableWithChecks } from "@/components/pr-table-with-checks";
import { StatusFilters } from "@/components/status-filters";
import { useApp } from "@/lib/app-context";
import { getCachedDocsIndex, getCachedReviewQueue } from "@/lib/dashboard-data";
import { enrichPullRequestsWithDocs } from "@/lib/docs-index";
import {
  filterPullRequests,
  withoutLocalSessionFilters,
  type DashboardFilters,
} from "@/lib/filters";
import type { PullRequest } from "@/lib/types";
import { GitPullRequest } from "lucide-react";
import { useEffect, useState } from "react";

export function ReviewQueueTab({
  viewerLogin,
  filters,
}: {
  viewerLogin: string;
  filters: DashboardFilters;
}) {
  const { config, refreshGeneration, silentRefresh } = useApp();
  const [reviewQueue, setReviewQueue] = useState<PullRequest[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Background refreshes swap the list in place instead of showing the skeleton.
    if (!silentRefresh) setReviewQueue(null);

    void (async () => {
      const token = config.githubToken;
      if (!token) {
        if (!cancelled) setReviewQueue([]);
        return;
      }

      try {
        const queue = await getCachedReviewQueue(
          token,
          viewerLogin,
          config.scope,
        );
        const docsRoot = config.docsFolder.handle;
        if (config.localDocsIntegration && docsRoot) {
          const docsIndex = await getCachedDocsIndex(docsRoot);
          enrichPullRequestsWithDocs(queue, docsIndex);
        }
        if (!cancelled) setReviewQueue(queue);
      } catch {
        if (cancelled) return;
        setReviewQueue((current) => (silentRefresh && current ? current : []));
      }
    })();

    return () => {
      cancelled = true;
    };
    // silentRefresh only describes the generation; it never triggers a load on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config.docsFolder.handle,
    config.githubToken,
    config.scope,
    config.localDocsIntegration,
    refreshGeneration,
    viewerLogin,
  ]);

  if (reviewQueue === null) {
    return <ReviewQueueTabFallback />;
  }

  const scoped = filters.repo
    ? reviewQueue.filter((pr) => pr.repository.nameWithOwner === filters.repo)
    : reviewQueue;
  const tableFilters = config.localDocsIntegration
    ? filters
    : withoutLocalSessionFilters(filters);
  const visible = filterPullRequests(reviewQueue, tableFilters);

  return (
    <>
      <StatusFilters
        pullRequests={scoped}
        filters={filters}
        showLocalSessionFilters={config.localDocsIntegration}
      />
      {visible.length === 0 ? (
        <EmptyFilter message="Nothing waiting on your review" />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded-lg ring-1 ring-foreground/10">
          <PrTableWithChecks
            pullRequests={visible}
            filters={filters}
            hideReviewers
          />
        </div>
      )}
    </>
  );
}

function ReviewQueueTabFallback() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex gap-2">
        <div className="h-6 w-14 animate-pulse rounded-full bg-muted" />
        <div className="h-6 w-28 animate-pulse rounded-full bg-muted" />
      </div>
      <DashboardSkeleton />
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
