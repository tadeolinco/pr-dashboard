"use client";

import { TableHead } from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export function SortableTableHead<T extends string>({
  label,
  sortKey,
  sort,
  onSort,
  className,
  align = "left",
  ariaLabel,
  tooltip,
}: {
  label: string;
  sortKey: T;
  sort: { key: T; direction: "asc" | "desc" };
  onSort: (key: T) => void;
  className?: string;
  align?: "left" | "right";
  ariaLabel?: string;
  tooltip?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = active
    ? sort.direction === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;

  const button = (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex w-full items-center gap-0.5 font-medium hover:text-foreground ${
        align === "right" ? "justify-end" : "justify-start"
      } ${active ? "text-foreground" : "text-muted-foreground"}`}
      aria-sort={
        active
          ? sort.direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
      aria-label={ariaLabel ?? (label || undefined)}
    >
      {label ? <span>{label}</span> : null}
      <Icon className="size-3 shrink-0 opacity-70" aria-hidden />
    </button>
  );

  return (
    <TableHead className={className}>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
    </TableHead>
  );
}
