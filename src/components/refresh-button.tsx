import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/app-context";
import { RefreshCw } from "lucide-react";

export function RefreshButton() {
  const { refresh, backgroundRefreshing } = useApp();

  return (
    <Button
      variant="outline"
      size="sm"
      className="relative"
      onClick={() => refresh()}
      title={backgroundRefreshing ? "Updating in the background" : undefined}
    >
      <RefreshCw />
      Refresh
      {backgroundRefreshing ? (
        <span className="absolute -top-0.5 -right-0.5 flex size-2.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
        </span>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {backgroundRefreshing ? "Updating in the background" : ""}
      </span>
    </Button>
  );
}
