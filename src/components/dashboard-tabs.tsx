import { PendingReviewsPanel } from "@/components/pending-reviews-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dashboardHref, type DashboardFilters } from "@/lib/filters";
import { useNavigation } from "@/lib/navigation";
import type { ReactNode } from "react";

export function DashboardTabs({
  filters,
  myPrs,
  myReviewQueue,
}: {
  filters: DashboardFilters;
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
        <TabsTrigger value="my-prs">My PRs</TabsTrigger>
        <TabsTrigger value="my-review-queue">To review</TabsTrigger>
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
