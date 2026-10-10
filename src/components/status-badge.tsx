import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/pr-status";
import type { ReviewStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<ReviewStatus, string> = {
  awaiting_reviewer:
    "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300",
  review_requested:
    "border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-300",
  commented:
    "border-transparent bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  changes_requested:
    "border-transparent bg-red-500/15 text-red-700 dark:text-red-300",
  approved:
    "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

export function StatusBadge({ status }: { status: ReviewStatus }) {
  return (
    <Badge className={cn("font-medium", STATUS_STYLES[status])}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
