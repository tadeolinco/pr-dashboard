import { Button } from "@/components/ui/button";
import type { SharedSetup } from "@/lib/setup-link";
import { X } from "lucide-react";

export type SetupNotice =
  | { kind: "applied"; setup: SharedSetup }
  | { kind: "confirm"; setup: SharedSetup }
  | { kind: "invalid" };

function describe(setup: SharedSetup) {
  const parts: string[] = [];
  if (setup.scope.owners.length > 0) {
    parts.push(setup.scope.owners.map((owner) => owner.login).join(", "));
  }
  if (setup.repoSettings.length > 0) {
    parts.push(
      `settings for ${setup.repoSettings.length} repo${setup.repoSettings.length === 1 ? "" : "s"}`,
    );
  }
  if (setup.botLogins) parts.push(`${setup.botLogins.length} bot accounts`);
  return parts.length > 0 ? parts.join(" · ") : "no settings";
}

export function SetupLinkBanner({
  notice,
  onApply,
  onDismiss,
}: {
  notice: SetupNotice;
  onApply: (setup: SharedSetup) => void;
  onDismiss: () => void;
}) {
  let message: string;
  if (notice.kind === "invalid") {
    message = "This setup link couldn't be read, so nothing was changed.";
  } else if (notice.kind === "applied") {
    message = `Set up from a shared link: ${describe(notice.setup)}.`;
  } else {
    message = `This link has shared settings (${describe(notice.setup)}). Applying replaces your repo settings, bot accounts and orgs & repos.`;
  }

  return (
    <div className="shrink-0 border-b bg-muted/50">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-2 text-sm lg:px-8">
        <p className="min-w-0 flex-1">{message}</p>
        {notice.kind === "confirm" ? (
          <Button type="button" size="sm" onClick={() => onApply(notice.setup)}>
            Apply
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <X />
        </Button>
      </div>
    </div>
  );
}
