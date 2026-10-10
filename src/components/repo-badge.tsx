import { REPO_BADGE_CLASS, repoBadgeStyle } from "@/lib/repo-colors";
import { repoLabel } from "@/lib/repo-settings";
import { AppLink } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const badgeBase =
  "inline-flex min-w-[1.75rem] items-center justify-center rounded px-1 py-0.5 text-[10px] font-semibold leading-none tracking-tight transition-opacity hover:opacity-90";

export function RepoBadge({
  repositoryName,
  nameWithOwner,
  href,
  className,
}: {
  repositoryName: string;
  nameWithOwner?: string;
  href?: string;
  className?: string;
}) {
  const label = repoLabel(repositoryName);
  const style = repoBadgeStyle(repositoryName);
  const title = nameWithOwner ?? repositoryName;

  if (href) {
    return (
      <AppLink
        href={href}
        title={title}
        style={style}
        className={cn(badgeBase, REPO_BADGE_CLASS, className)}
      >
        {label}
      </AppLink>
    );
  }

  return (
    <span
      title={title}
      style={style}
      className={cn(badgeBase, REPO_BADGE_CLASS, className)}
    >
      {label}
    </span>
  );
}

/** GitHub `owner/repo` → repo segment for color lookup. */
export function repositoryNameFromFullName(repoFull: string): string {
  const slash = repoFull.lastIndexOf("/");
  return slash >= 0 ? repoFull.slice(slash + 1) : repoFull;
}
