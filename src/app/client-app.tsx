"use client";

import { Providers } from "@/components/providers";
import dynamic from "next/dynamic";

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
