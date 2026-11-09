import * as Hex from "effect/encoding/Hex";
import { create } from "zustand";

import { parseFolderMenuAction } from "./components/threadActionMenu.logic";
import { requestFolderDetails } from "./sidebarFolderNameRequest";
import {
  applyFolderDirective,
  folderDirectiveHash,
  type SidebarFolderDirective,
} from "./sidebarFolderDirective.logic";

import {
  EMPTY_SIDEBAR_FOLDER_STATE,
  createFolder,
  deleteFolder,
  dismissSuggestion,
  moveThreadsToFolder,
  nextFolderColor,
  normalizeFolderName,
  parseSidebarFolderState,
  placeFolder,
  renameFolder,
  setActiveFolder,
  setDraftFolderChoice,
  setFolderColor,
  setFolderMainThread,
  setFolderThreadOrder,
  settlePromotedDraft,
  toggleFolderCollapsed,
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
        folderChoiceByDraftId: state.folderChoiceByDraftId,
        dismissedSuggestionByThreadKey: state.dismissedSuggestionByThreadKey,
        collapsedFolderIds: state.collapsedFolderIds,
        threadOrderByFolder: state.threadOrderByFolder,
        mainThreadKeyByFolder: state.mainThreadKeyByFolder,
      } satisfies SidebarFolderState),
    );
  } catch {}
}

interface SidebarFolderStore extends SidebarFolderState {
  /** Returns the new folder id, or null when the name is blank. */
  readonly createFolder: (name: string, color?: SidebarFolderColor) => string | null;
  readonly editFolder: (folderId: string, name: string, color: SidebarFolderColor) => void;
  /** A blank name keeps the current one. */
  readonly renameFolder: (folderId: string, name: string) => void;
  readonly placeFolder: (
    folderId: string,
    targetFolderId: string,
    edge: "before" | "after",
  ) => void;
  readonly deleteFolder: (folderId: string) => void;
  readonly moveThreads: (threadKeys: ReadonlyArray<string>, folderId: string | null) => void;
  readonly setActiveFolder: (folderId: string | null) => void;
  /** `folderId` null records an explicit "no folder" for the draft. */
  readonly setDraftFolder: (draftId: string, folderId: string | null) => void;
  readonly settlePromotedDraft: (draftId: string, threadKey: string) => void;
  readonly forgetDraft: (draftId: string) => void;
  readonly dismissSuggestion: (threadKey: string, folderId: string) => void;
  readonly toggleFolderCollapsed: (folderId: string) => void;
  /** Places the folder's rows in this order. */
  readonly setFolderOrder: (folderId: string, order: ReadonlyArray<string>) => void;
  /** Files the thread in the folder and places the folder's rows in this order. */
  readonly placeThreadInFolder: (
    threadKey: string,
    folderId: string,
    order: ReadonlyArray<string>,
  ) => void;
  /** `threadKey` null leaves the folder without a main thread. */
  readonly setMainThread: (folderId: string, threadKey: string | null) => void;
  /** Files threads as an agent's folder block asks, creating its folder when missing. */
  readonly applyDirective: (directive: SidebarFolderDirective, environmentId: string) => void;
}

function pickState(store: SidebarFolderStore): SidebarFolderState {
  return {
    folders: store.folders,
    folderIdByThreadKey: store.folderIdByThreadKey,
    activeFolderId: store.activeFolderId,
    folderChoiceByDraftId: store.folderChoiceByDraftId,
    dismissedSuggestionByThreadKey: store.dismissedSuggestionByThreadKey,
    collapsedFolderIds: store.collapsedFolderIds,
    threadOrderByFolder: store.threadOrderByFolder,
    mainThreadKeyByFolder: store.mainThreadKeyByFolder,
  };
}

const newFolderId = () => Hex.encode(globalThis.crypto.getRandomValues(new Uint8Array(12)));

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
      const id = newFolderId();
      apply((state) =>
        createFolder(state, color === undefined ? { id, name } : { id, name, color }),
      );
      return id;
    },
    editFolder: (folderId, name, color) =>
      apply((state) => setFolderColor(renameFolder(state, folderId, name), folderId, color)),
    renameFolder: (folderId, name) => apply((state) => renameFolder(state, folderId, name)),
    placeFolder: (folderId, targetFolderId, edge) =>
      apply((state) => placeFolder(state, folderId, targetFolderId, edge)),
    deleteFolder: (folderId) => apply((state) => deleteFolder(state, folderId)),
    moveThreads: (threadKeys, folderId) =>
      apply((state) => moveThreadsToFolder(state, threadKeys, folderId)),
    setActiveFolder: (folderId) => apply((state) => setActiveFolder(state, folderId)),
    setDraftFolder: (draftId, folderId) =>
      apply((state) => setDraftFolderChoice(state, draftId, folderId)),
    settlePromotedDraft: (draftId, threadKey) =>
      apply((state) => settlePromotedDraft(state, draftId, threadKey)),
    dismissSuggestion: (threadKey, folderId) =>
      apply((state) => dismissSuggestion(state, threadKey, folderId)),
    toggleFolderCollapsed: (folderId) => apply((state) => toggleFolderCollapsed(state, folderId)),
    setFolderOrder: (folderId, order) =>
      apply((state) => setFolderThreadOrder(state, folderId, order)),
    placeThreadInFolder: (threadKey, folderId, order) =>
      apply((state) =>
        setFolderThreadOrder(moveThreadsToFolder(state, [threadKey], folderId), folderId, order),
      ),
    setMainThread: (folderId, threadKey) =>
      apply((state) => setFolderMainThread(state, folderId, threadKey)),
    applyDirective: (directive, environmentId) =>
      apply((state) =>
        applyFolderDirective(state, directive, { environmentId, newFolderId: newFolderId() }),
      ),
    forgetDraft: (draftId) =>
      apply((state) => {
        if (!(draftId in state.folderChoiceByDraftId)) return state;
        const { [draftId]: _forgotten, ...folderChoiceByDraftId } = state.folderChoiceByDraftId;
        return { ...state, folderChoiceByDraftId };
      }),
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
  if (action === "folder-main") {
    const store = useSidebarFolderStore.getState();
    const [threadKey] = threadKeys;
    const folderId = threadKey === undefined ? undefined : store.folderIdByThreadKey[threadKey];
    if (threadKey !== undefined && folderId !== undefined) {
      store.setMainThread(
        folderId,
        store.mainThreadKeyByFolder[folderId] === threadKey ? null : threadKey,
      );
    }
    return true;
  }
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

const APPLIED_DIRECTIVES_STORAGE_KEY = "t3code:sidebar-folder-directives:v1";
const APPLIED_DIRECTIVES_LIMIT = 500;

/**
 * Applies an agent's folder block once per thread and block text, so reopening the thread
 * later does not undo folder changes made since.
 */
export function applyFolderDirectiveOnce(
  directive: SidebarFolderDirective,
  input: { readonly threadKey: string; readonly environmentId: string; readonly code: string },
): void {
  if (typeof window === "undefined") return;
  const key = `${input.threadKey}:${folderDirectiveHash(input.code)}`;
  let applied: string[] = [];
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(APPLIED_DIRECTIVES_STORAGE_KEY) ?? "[]",
    );
    if (Array.isArray(parsed)) {
      applied = parsed.filter((entry): entry is string => typeof entry === "string");
    }
  } catch {}
  if (applied.includes(key)) return;
  try {
    window.localStorage.setItem(
      APPLIED_DIRECTIVES_STORAGE_KEY,
      JSON.stringify([...applied, key].slice(-APPLIED_DIRECTIVES_LIMIT)),
    );
  } catch {
    // Without a record the block would apply again on every render.
    return;
  }
  useSidebarFolderStore.getState().applyDirective(directive, input.environmentId);
}
