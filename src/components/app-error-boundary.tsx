"use client";

import { Button } from "@/components/ui/button";
import { clearLocalData } from "@/lib/app-preferences";
import { Component, type ReactNode } from "react";

type State = { error: Error | null };

/** Shows the error instead of a blank page when rendering the app throws. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
        <h1 className="font-heading text-2xl font-medium">
          PR dashboard hit an error
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Reload to try again. If it keeps happening, Clear data removes the
          token, settings and cached data from this browser.
        </p>
        <pre className="mt-4 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
          {error.message}
        </pre>
        <div className="mt-6 flex gap-2">
          <Button type="button" size="sm" onClick={() => window.location.reload()}>
            Reload
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={async () => {
              await clearLocalData();
              window.location.reload();
            }}
          >
            Clear data
          </Button>
        </div>
      </main>
    );
  }
}
