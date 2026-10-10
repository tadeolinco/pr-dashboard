export function SetupMissingToken() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
      <h1 className="font-heading text-2xl font-medium">Connect GitHub</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        PR dashboard reads your open pull requests with a GitHub token. Open
        Settings and paste a personal access token to get started.
      </p>
      <ol className="mt-6 list-decimal space-y-3 pl-5 text-sm leading-6">
        <li>
          Create a classic personal access token with the <code>repo</code>{" "}
          scope, or run <code>gh auth token</code> if you already use the GitHub
          CLI.
        </li>
        <li>
          Open Settings in the header and paste the token into the password
          field.
        </li>
      </ol>
    </main>
  );
}
