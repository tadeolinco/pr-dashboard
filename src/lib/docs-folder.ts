/**
 * The docs folder is a directory handle from the File System Access API,
 * picked once by the user and kept in IndexedDB. Access is read-only.
 */

export type DocsAccess =
  | "unsupported"
  | "not-chosen"
  | "needs-permission"
  | "granted";

export type DocsFolderState = {
  access: DocsAccess;
  /** Set only when access is "granted". */
  handle: FileSystemDirectoryHandle | null;
  /** Folder name of the saved handle, even before permission is granted. */
  name: string | null;
};

const DB_NAME = "pr-dashboard";
const STORE = "handles";
const DOCS_KEY = "docs-root";
const READ = { mode: "read" } as const;

export function supportsDocsFolder() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function loadDocsFolder(): Promise<DocsFolderState> {
  if (!supportsDocsFolder()) {
    return { access: "unsupported", handle: null, name: null };
  }
  const saved = await withTimeout(readSavedHandle(), null);
  if (!saved) return { access: "not-chosen", handle: null, name: null };
  // Chrome can leave this pending forever on a saved handle. Treat that as
  // "ask again" so the dashboard still loads and Reconnect shows.
  const permission = await withTimeout(saved.queryPermission(READ), "prompt");
  if (permission === "granted") {
    return { access: "granted", handle: saved, name: saved.name };
  }
  return { access: "needs-permission", handle: null, name: saved.name };
}

const DOCS_CHECK_TIMEOUT_MS = 2000;

/** Resolves to `fallback` when `promise` takes longer than the docs check allows or fails. */
function withTimeout<T, F>(promise: Promise<T>, fallback: F): Promise<T | F> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), DOCS_CHECK_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/** Opens the folder picker. Must run inside a click handler. */
export async function chooseDocsFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!window.showDirectoryPicker) return null;
  try {
    const handle = await window.showDirectoryPicker({ id: "docs", ...READ });
    await writeSavedHandle(handle);
    return handle;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return null;
    }
    throw error;
  }
}

/** Asks the browser to re-grant read access. Must run inside a click handler. */
export async function reconnectDocsFolder(): Promise<boolean> {
  const saved = await readSavedHandle();
  if (!saved) return false;
  return (await saved.requestPermission(READ)) === "granted";
}

export async function forgetDocsFolder() {
  await withStore("readwrite", (store) => store.delete(DOCS_KEY));
}

async function readSavedHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const value = await withStore("readonly", (store) => store.get(DOCS_KEY));
    return value instanceof FileSystemDirectoryHandle ? value : null;
  } catch {
    return null;
  }
}

async function writeSavedHandle(handle: FileSystemDirectoryHandle) {
  await withStore("readwrite", (store) => store.put(handle, DOCS_KEY));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
