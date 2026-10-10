import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-3 px-4 py-4 lg:px-6">
      <div className="flex gap-2">
        <Skeleton className="h-6 w-14 rounded-full" />
        <Skeleton className="h-6 w-28 rounded-full" />
        <Skeleton className="h-6 w-32 rounded-full" />
      </div>
      <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
        <Skeleton className="h-8 w-full rounded-none" />
        {Array.from({ length: 12 }).map((_, index) => (
          <Skeleton key={index} className="mt-px h-7 w-full rounded-none" />
        ))}
      </div>
    </div>
  );
}
