import { githubTokenFromPreferences, readAppPreferences } from "@/lib/app-preferences";
import { loadDocsFolder, type DocsFolderState } from "@/lib/docs-folder";
import type { PrScope } from "@/lib/scope";

export type AppConfig = {
  githubToken: string | null;
  scope: PrScope;
  docsFolder: DocsFolderState;
  /** Docs columns are on: the toggle is on and the docs folder is readable. */
  localDocsIntegration: boolean;
};

export async function loadAppConfig(): Promise<AppConfig> {
  const preferences = readAppPreferences();
  const docsFolder = await loadDocsFolder();
  return {
    githubToken: githubTokenFromPreferences(),
    scope: preferences.scope,
    docsFolder,
    localDocsIntegration:
      preferences.localDocsIntegration && docsFolder.handle !== null,
  };
}
