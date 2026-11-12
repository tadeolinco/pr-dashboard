"use client";

import { Providers } from "@/components/providers";
import { applyTheme } from "@/lib/theme";
import dynamic from "next/dynamic";

// Set the theme class before the app chunk loads, so it does not flash light.
applyTheme();

// The app reads localStorage, IndexedDB and window.location on first render.
const App = dynamic(() => import("@/App").then((mod) => mod.App), {
  ssr: false,
});

export function ClientApp() {
  return (
    <Providers>
      <App />
    </Providers>
  );
}
