export type DirEntry = { name: string; isDirectory: boolean };

/** Read-only view of the docs folder the user picked, addressed by relative path. */
export type DocsFs = {
  pathExists(path: string): Promise<boolean>;
  readTextFile(path: string): Promise<string>;
  readDir(path: string): Promise<DirEntry[]>;
};

export function createDocsFs(root: FileSystemDirectoryHandle): DocsFs {
  async function directoryAt(segments: string[]) {
    let dir = root;
    for (const segment of segments) {
      dir = await dir.getDirectoryHandle(segment);
    }
    return dir;
  }

  async function fileAt(path: string) {
    const segments = splitPath(path);
    const name = segments.pop();
    if (!name) throw new Error(`Not a file path: ${path}`);
    const dir = await directoryAt(segments);
    return dir.getFileHandle(name);
  }

  return {
    async pathExists(path) {
      try {
        await directoryAt(splitPath(path));
        return true;
      } catch {
        try {
          await fileAt(path);
          return true;
        } catch {
          return false;
        }
      }
    },
    async readTextFile(path) {
      const handle = await fileAt(path);
      const file = await handle.getFile();
      return file.text();
    },
    async readDir(path) {
      const dir = await directoryAt(splitPath(path));
      const entries: DirEntry[] = [];
      for await (const [name, handle] of dir.entries()) {
        entries.push({ name, isDirectory: handle.kind === "directory" });
      }
      return entries;
    },
  };
}

export function joinPath(...parts: string[]): string {
  return parts
    .flatMap((part) => part.split("/"))
    .filter((segment) => segment && segment !== ".")
    .join("/");
}

export function basename(filePath: string): string {
  const segments = splitPath(filePath);
  return segments[segments.length - 1] ?? "";
}

function splitPath(path: string): string[] {
  const segments = joinPath(path).split("/").filter(Boolean);
  if (segments.includes("..")) {
    throw new Error(`Docs paths cannot leave the docs folder: ${path}`);
  }
  return segments;
}
