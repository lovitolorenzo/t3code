import {
  createFolder,
  moveThreadsToFolder,
  normalizeFolderName,
  setFolderMainThread,
  type SidebarFolderState,
} from "./sidebarFolders.logic";

/** Fence language of the block an agent writes to file threads in a sidebar folder. */
export const SIDEBAR_FOLDER_DIRECTIVE_LANGUAGE = "t3-folders";

export interface SidebarFolderDirective {
  /** The folder to file the threads in, or null to take them out of their folders. */
  readonly folder: string | null;
  /** Thread ids, scoped thread keys, or `t3-thread://v1/<id>` links. */
  readonly threads: ReadonlyArray<string>;
  /** One of `threads`, made the folder's main thread. */
  readonly main?: string;
}

const THREAD_LINK_PREFIX = "t3-thread://v1/";
// Environment ids are UUIDs; agent-made thread ids such as `mcp:<uuid>` are not.
const SCOPED_KEY_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:/i;

export function parseFolderDirective(code: string): SidebarFolderDirective | null {
  let value: unknown;
  try {
    value = JSON.parse(code);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { folder, threads, main } = value as Record<string, unknown>;
  const name = typeof folder === "string" ? normalizeFolderName(folder) : null;
  if (folder !== null && name === null) return null;
  if (!Array.isArray(threads) || threads.length === 0) return null;
  const ids: string[] = [];
  for (const entry of threads) {
    if (typeof entry !== "string") return null;
    const id = entry.trim().replace(THREAD_LINK_PREFIX, "");
    if (id.length === 0) return null;
    if (!ids.includes(id)) ids.push(id);
  }
  if (main === undefined) return { folder: name, threads: ids };
  // Only a folder has a main thread, and it is filed with the others.
  const mainId = typeof main === "string" ? main.trim().replace(THREAD_LINK_PREFIX, "") : "";
  if (name === null || mainId.length === 0) return null;
  if (!ids.includes(mainId)) ids.push(mainId);
  return { folder: name, threads: ids, main: mainId };
}

/** Thread keys for the directive; bare ids belong to the environment of the thread it came from. */
export function folderDirectiveThreadKeys(
  directive: SidebarFolderDirective,
  environmentId: string,
): ReadonlyArray<string> {
  return directive.threads.map((id) =>
    SCOPED_KEY_PREFIX.test(id) ? id : `${environmentId}:${id}`,
  );
}

/** Files the threads, creating the folder with `newFolderId` when no folder has that name. */
export function applyFolderDirective(
  state: SidebarFolderState,
  directive: SidebarFolderDirective,
  input: { readonly environmentId: string; readonly newFolderId: string },
): SidebarFolderState {
  const threadKeys = folderDirectiveThreadKeys(directive, input.environmentId);
  if (directive.folder === null) return moveThreadsToFolder(state, threadKeys, null);
  const existing = findFolderByName(state, directive.folder);
  const folderId = existing?.id ?? input.newFolderId;
  const withFolder =
    existing !== undefined
      ? state
      : createFolder(state, { id: input.newFolderId, name: directive.folder });
  const filed = moveThreadsToFolder(withFolder, threadKeys, folderId);
  if (directive.main === undefined) return filed;
  const [mainKey] = folderDirectiveThreadKeys(
    { folder: directive.folder, threads: [directive.main] },
    input.environmentId,
  );
  return setFolderMainThread(filed, folderId, mainKey!);
}

export function findFolderByName(state: Pick<SidebarFolderState, "folders">, name: string) {
  const wanted = name.toLocaleLowerCase();
  return state.folders.find((folder) => folder.name.toLocaleLowerCase() === wanted);
}

/** A short stable hash, so a directive applies once per thread however often it renders. */
export function folderDirectiveHash(code: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < code.length; index++) {
    hash ^= code.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
