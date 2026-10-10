import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/app-context";
import { RefreshCw } from "lucide-react";

export function RefreshButton() {
  const { refresh } = useApp();

  return (
    <Button variant="outline" size="sm" onClick={() => refresh()}>
      <RefreshCw />
      Refresh
    </Button>
  );
}
