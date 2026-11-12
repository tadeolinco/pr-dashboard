import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { Monitor, Moon, Sun } from "lucide-react";

const LABELS: Record<ThemeChoice, string> = {
  system: "Theme: System",
  light: "Theme: Light",
  dark: "Theme: Dark",
};

const ICONS: Record<ThemeChoice, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

/** Cycles System → Light → Dark. */
export function ThemeToggle() {
  const { choice, cycle } = useTheme();
  const Icon = ICONS[choice];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon-sm" onClick={cycle} aria-label={LABELS[choice]}>
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{LABELS[choice]}</TooltipContent>
    </Tooltip>
  );
}
