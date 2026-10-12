import { PendingReviewsPanel } from "@/components/pending-reviews-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dashboardHref, type DashboardFilters } from "@/lib/filters";
import { formatCount } from "@/lib/format";
import { useNavigation } from "@/lib/navigation";
import type { ReactNode } from "react";

export function DashboardTabs({
  filters,
  myPrsCount,
  myReviewQueueCount,
  myPrs,
  myReviewQueue,
}: {
  filters: DashboardFilters;
  myPrsCount: number;
  /** Null while the review queue is still loading. */
  myReviewQueueCount: number | null;
  myPrs: ReactNode;
  myReviewQueue: ReactNode;
}) {
  const { navigate } = useNavigation();
  const view = filters.view ?? "my-prs";

  return (
    <Tabs
      value={view}
      onValueChange={(next) => {
        navigate(
          dashboardHref({ ...filters, view: next as DashboardFilters["view"] }),
        );
      }}
      className="flex min-h-0 flex-1 flex-col gap-3"
    >
      <TabsList variant="line">
        <TabsTrigger value="my-prs">
          My PRs
          <TabCount count={myPrsCount} />
        </TabsTrigger>
        <TabsTrigger value="my-review-queue">
          To review
          <TabCount count={myReviewQueueCount} />
        </TabsTrigger>
        <TabsTrigger value="pending-reviews">Pending reviews</TabsTrigger>
      </TabsList>
      <TabsContent
        value="my-prs"
        className="flex min-h-0 flex-1 flex-col gap-3"
      >
        {myPrs}
      </TabsContent>
      <TabsContent
        value="my-review-queue"
        className="flex min-h-0 flex-1 flex-col gap-3"
      >
        {myReviewQueue}
      </TabsContent>
      <TabsContent
        value="pending-reviews"
        className="flex min-h-0 flex-1 flex-col"
      >
        <PendingReviewsPanel />
      </TabsContent>
    </Tabs>
  );
}

function TabCount({ count }: { count: number | null }) {
  if (count === null) return null;
  return (
    <span className="rounded-full bg-muted px-1.5 text-xs font-medium tabular-nums text-muted-foreground">
      {formatCount(count)}
    </span>
  );
}
