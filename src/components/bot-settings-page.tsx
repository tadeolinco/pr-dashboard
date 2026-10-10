import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DEFAULT_BOT_LOGINS, parseBotLogins } from "@/lib/bots";
import { useState } from "react";

export function BotSettingsPage({
  botLogins,
  onSave,
  onCancel,
}: {
  /** null means the built-in default list. */
  botLogins: string[] | null;
  onSave: (botLogins: string[] | null) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() =>
    (botLogins ?? DEFAULT_BOT_LOGINS).join("\n"),
  );
  const parsed = parseBotLogins(draft);
  const matchesDefaults =
    parsed.length === DEFAULT_BOT_LOGINS.length &&
    parsed.every((login, index) => login === DEFAULT_BOT_LOGINS[index]);

  return (
    <main className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <h1 className="font-heading text-2xl font-medium">Bot accounts</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Reviews from these accounts don&apos;t count as a human review, and
          they&apos;re left out of Pending reviews. GitHub app accounts and logins
          ending in <code className="text-xs">[bot]</code>,{" "}
          <code className="text-xs">-bot</code> or{" "}
          <code className="text-xs">_bot</code> always count as bots. Saved in this
          browser only.
        </p>

        <Card className="mt-6 gap-2 p-4">
          <label className="text-xs text-muted-foreground" htmlFor="bot-logins">
            One GitHub login per line ({parsed.length})
          </label>
          <textarea
            id="bot-logins"
            spellCheck={false}
            rows={16}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="w-full resize-y rounded-lg border border-input bg-background px-2.5 py-1.5 font-mono text-xs leading-5 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={matchesDefaults}
              onClick={() => setDraft(DEFAULT_BOT_LOGINS.join("\n"))}
            >
              Reset to defaults
            </Button>
          </div>
        </Card>

        <div className="mt-6 flex items-center gap-2">
          {/* Saving the untouched defaults stores null so future default additions apply. */}
          <Button type="button" onClick={() => onSave(matchesDefaults ? null : parsed)}>
            Save
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </main>
  );
}
