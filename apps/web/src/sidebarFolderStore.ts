import * as Hex from "effect/encoding/Hex";
import { create } from "zustand";

import { parseFolderMenuAction } from "./components/threadActionMenu.logic";
import { requestFolderDetails } from "./sidebarFolderNameRequest";

import {
  EMPTY_SIDEBAR_FOLDER_STATE,
  createFolder,
  deleteFolder,
  moveThreadsToFolder,
  nextFolderColor,
  normalizeFolderName,
  parseSidebarFolderState,
  renameFolder,
  setActiveFolder,
  setFolderColor,
  type SidebarFolderColor,
  type SidebarFolderState,
} from "./sidebarFolders.logic";

const SIDEBAR_FOLDERS_STORAGE_KEY = "t3code:sidebar-folders:v1";

function readPersistedFolders(): SidebarFolderState {
  if (typeof window === "undefined") return EMPTY_SIDEBAR_FOLDER_STATE;
  try {
    const raw = window.localStorage.getItem(SIDEBAR_FOLDERS_STORAGE_KEY);
    return raw ? parseSidebarFolderState(JSON.parse(raw)) : EMPTY_SIDEBAR_FOLDER_STATE;
  } catch {
    return EMPTY_SIDEBAR_FOLDER_STATE;
  }
}

function persistFolders(state: SidebarFolderState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SIDEBAR_FOLDERS_STORAGE_KEY,
      JSON.stringify({
        folders: state.folders,
        folderIdByThreadKey: state.folderIdByThreadKey,
        activeFolderId: state.activeFolderId,
      } satisfies SidebarFolderState),
    );
  } catch {}
}

interface SidebarFolderStore extends SidebarFolderState {
  /** Returns the new folder id, or null when the name is blank. */
  readonly createFolder: (name: string, color?: SidebarFolderColor) => string | null;
  readonly editFolder: (folderId: string, name: string, color: SidebarFolderColor) => void;
  readonly deleteFolder: (folderId: string) => void;
  readonly moveThreads: (threadKeys: ReadonlyArray<string>, folderId: string | null) => void;
  readonly setActiveFolder: (folderId: string | null) => void;
}

function pickState(store: SidebarFolderStore): SidebarFolderState {
  return {
    folders: store.folders,
    folderIdByThreadKey: store.folderIdByThreadKey,
    activeFolderId: store.activeFolderId,
  };
}

export const useSidebarFolderStore = create<SidebarFolderStore>()((set, get) => {
  const apply = (update: (state: SidebarFolderState) => SidebarFolderState) => {
    const current = pickState(get());
    const next = update(current);
    if (next === current) return;
    set(next);
    persistFolders(next);
  };
  return {
    ...readPersistedFolders(),
    createFolder: (name, color) => {
      if (normalizeFolderName(name) === null) return null;
      const id = Hex.encode(globalThis.crypto.getRandomValues(new Uint8Array(12)));
      apply((state) =>
        createFolder(state, color === undefined ? { id, name } : { id, name, color }),
      );
      return id;
    },
    editFolder: (folderId, name, color) =>
      apply((state) => setFolderColor(renameFolder(state, folderId, name), folderId, color)),
    deleteFolder: (folderId) => apply((state) => deleteFolder(state, folderId)),
    moveThreads: (threadKeys, folderId) =>
      apply((state) => moveThreadsToFolder(state, threadKeys, folderId)),
    setActiveFolder: (folderId) => apply((state) => setActiveFolder(state, folderId)),
  };
});

// Another window of this app writes the same storage; follow its changes.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== SIDEBAR_FOLDERS_STORAGE_KEY) return;
    useSidebarFolderStore.setState(readPersistedFolders());
  });
}

/**
 * Runs a `folder:*` menu choice for the given threads. Returns false for any
 * other action so callers can fall through to their own handling.
 */
export async function applyFolderMenuAction(
  action: string,
  threadKeys: ReadonlyArray<string>,
): Promise<boolean> {
  const parsed = parseFolderMenuAction(action);
  if (parsed === null) return false;
  if (parsed.kind === "move") {
    useSidebarFolderStore.getState().moveThreads(threadKeys, parsed.folderId);
    return true;
  }
  const folderId = await requestNewFolder();
  if (folderId !== null) useSidebarFolderStore.getState().moveThreads(threadKeys, folderId);
  return true;
}

/** Prompts for a name and color and creates the folder; resolves its id, or null when cancelled. */
export async function requestNewFolder(): Promise<string | null> {
  const details = await requestFolderDetails({
    title: "New folder",
    submitLabel: "Create",
    initial: { name: "", color: nextFolderColor(useSidebarFolderStore.getState().folders) },
  });
  return details === null
    ? null
    : useSidebarFolderStore.getState().createFolder(details.name, details.color);
}
