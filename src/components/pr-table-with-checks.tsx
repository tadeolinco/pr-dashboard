import { PrTable } from "@/components/pr-table";
import { useApp } from "@/lib/app-context";
import type { DashboardFilters } from "@/lib/filters";
import { fetchCheckStatuses } from "@/lib/github-checks";
import { fetchDevelopmentSyncStatuses } from "@/lib/github-development-sync";
import type {
  CheckStatus,
  DevelopmentSyncStatus,
  PullRequest,
} from "@/lib/types";
import { useEffect, useMemo, useState } from "react";

export function PrTableWithChecks({
  pullRequests,
  filters,
  hideReviewers = false,
}: {
  pullRequests: PullRequest[];
  filters: DashboardFilters;
  hideReviewers?: boolean;
}) {
  const idKey = useMemo(
    () => pullRequests.map((pr) => pr.id).join("\0"),
    [pullRequests],
  );
  const [checkStatuses, setCheckStatuses] = useState<Record<
    string,
    CheckStatus
  > | null>(null);
  const [checkError, setCheckError] = useState(false);
  const [developmentSyncStatuses, setDevelopmentSyncStatuses] = useState<Record<
    string,
    DevelopmentSyncStatus
  > | null>(null);
  const [developmentSyncError, setDevelopmentSyncError] = useState(false);
  // Statuses from the previous fetch stay on screen while a new one runs (e.g. a
  // background refresh); only PRs missing from them show as loading.
  const [checksPending, setChecksPending] = useState(false);
  const [developmentSyncPending, setDevelopmentSyncPending] = useState(false);
  const { config } = useApp();
  const token = config.githubToken;

  useEffect(() => {
    if (pullRequests.length === 0) {
      setCheckStatuses({});
      setDevelopmentSyncStatuses({});
      setChecksPending(false);
      setDevelopmentSyncPending(false);
      return;
    }

    if (!token) {
      setCheckError(true);
      setCheckStatuses({});
      setDevelopmentSyncError(true);
      setDevelopmentSyncStatuses({});
      setChecksPending(false);
      setDevelopmentSyncPending(false);
      return;
    }

    let cancelled = false;
    setChecksPending(true);
    setDevelopmentSyncPending(true);

    void fetchCheckStatuses(
      token,
      pullRequests.map((pr) => pr.id),
    )
      .then((statuses) => {
        if (cancelled) return;
        setCheckStatuses(statuses);
        setCheckError(false);
        setChecksPending(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCheckError(true);
        setCheckStatuses((current) => current ?? {});
        setChecksPending(false);
      });

    void fetchDevelopmentSyncStatuses(
      token,
      pullRequests.map((pr) => ({
        id: pr.id,
        headRefOid: pr.headRefOid,
        repository: {
          name: pr.repository.name,
          nameWithOwner: pr.repository.nameWithOwner,
        },
      })),
    )
      .then((statuses) => {
        if (cancelled) return;
        setDevelopmentSyncStatuses(statuses);
        setDevelopmentSyncError(false);
        setDevelopmentSyncPending(false);
      })
      .catch(() => {
        if (cancelled) return;
        setDevelopmentSyncError(true);
        setDevelopmentSyncStatuses((current) => current ?? {});
        setDevelopmentSyncPending(false);
      });

    return () => {
      cancelled = true;
    };
  }, [idKey, pullRequests, token]);

  const merged = useMemo(() => {
    const checksReady = checkStatuses !== null;
    const devReady = developmentSyncStatuses !== null;
    if (!checksReady && !devReady) return pullRequests;
    return pullRequests.map((pr) => ({
      ...pr,
      checkStatus: checkStatuses?.[pr.id] ?? pr.checkStatus,
      developmentSync: developmentSyncStatuses?.[pr.id] ?? pr.developmentSync,
    }));
  }, [checkStatuses, developmentSyncStatuses, pullRequests]);

  return (
    <PrTable
      pullRequests={merged}
      filters={filters}
      checksLoading={isLoading(checkStatuses, checksPending, pullRequests)}
      checksFailed={checkError}
      developmentSyncLoading={isLoading(
        developmentSyncStatuses,
        developmentSyncPending,
        pullRequests,
      )}
      developmentSyncFailed={developmentSyncError}
      hideReviewers={hideReviewers}
    />
  );
}

function isLoading(
  statuses: Record<string, unknown> | null,
  pending: boolean,
  pullRequests: PullRequest[],
) {
  if (statuses === null) return true;
  return pending && pullRequests.some((pr) => !(pr.id in statuses));
}
