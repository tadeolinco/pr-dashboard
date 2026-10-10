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
  const { config } = useApp();
  const token = config.githubToken;

  useEffect(() => {
    if (pullRequests.length === 0) {
      setCheckStatuses({});
      setDevelopmentSyncStatuses({});
      return;
    }

    let cancelled = false;
    setCheckStatuses(null);
    setCheckError(false);
    setDevelopmentSyncStatuses(null);
    setDevelopmentSyncError(false);

    if (!token) {
      setCheckError(true);
      setCheckStatuses({});
      setDevelopmentSyncError(true);
      setDevelopmentSyncStatuses({});
      return;
    }

    void fetchCheckStatuses(
      token,
      pullRequests.map((pr) => pr.id),
    )
      .then((statuses) => {
        if (!cancelled) setCheckStatuses(statuses);
      })
      .catch(() => {
        if (!cancelled) {
          setCheckError(true);
          setCheckStatuses({});
        }
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
        if (!cancelled) setDevelopmentSyncStatuses(statuses);
      })
      .catch(() => {
        if (!cancelled) {
          setDevelopmentSyncError(true);
          setDevelopmentSyncStatuses({});
        }
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
      checksLoading={checkStatuses === null}
      checksFailed={checkError}
      developmentSyncLoading={developmentSyncStatuses === null}
      developmentSyncFailed={developmentSyncError}
      hideReviewers={hideReviewers}
    />
  );
}
