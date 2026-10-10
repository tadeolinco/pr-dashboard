import { formatLocalDateTime, formatRelativeTime } from "@/lib/format";

/** "3 days ago", with the local date and time on hover. */
export function RelativeTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={formatLocalDateTime(iso)}>
      {formatRelativeTime(iso)}
    </time>
  );
}
