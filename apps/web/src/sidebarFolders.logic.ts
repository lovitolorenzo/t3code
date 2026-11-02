// Sidebar folders live only on this client. Each thread sits in at most one
// folder, keyed by its scoped thread key so threads from every environment can
// share a folder.

/** Hues that read on both light and dark sidebars. */
export const SIDEBAR_FOLDER_COLORS = {
  blue: "#3b82f6",
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
  violet: "#8b5cf6",
  pink: "#ec4899",
  teal: "#14b8a6",
  orange: "#f97316",
} as const;
export type SidebarFolderColor = keyof typeof SIDEBAR_FOLDER_COLORS;
const FOLDER_COLOR_KEYS = Object.keys(SIDEBAR_FOLDER_COLORS) as SidebarFolderColor[];

function isSidebarFolderColor(value: unknown): value is SidebarFolderColor {
  return typeof value === "string" && Object.hasOwn(SIDEBAR_FOLDER_COLORS, value);
}

/** The first color no folder uses yet, cycling once all are taken. */
export function nextFolderColor(folders: ReadonlyArray<SidebarFolder>): SidebarFolderColor {
  const used = new Set(folders.map((folder) => folder.color));
  return (
    FOLDER_COLOR_KEYS.find((color) => !used.has(color)) ??
    FOLDER_COLOR_KEYS[folders.length % FOLDER_COLOR_KEYS.length]!
  );
}

export interface SidebarFolder {
  readonly id: string;
  readonly name: string;
  readonly color: SidebarFolderColor;
}

/** A draft's folder choice: a folder id, or `none` when the user picked no folder. */
export type DraftFolderChoice = string;
const NO_FOLDER_CHOICE = "none";

export interface SidebarFolderState {
  readonly folders: ReadonlyArray<SidebarFolder>;
  readonly folderIdByThreadKey: Readonly<Record<string, string>>;
  readonly activeFolderId: string | null;
  /** Choices made in a new-thread draft, applied when the draft becomes a thread. */
  readonly folderChoiceByDraftId: Readonly<Record<string, DraftFolderChoice>>;
  /** Folder suggestions the user dismissed, so the same one does not return. */
  readonly dismissedSuggestionByThreadKey: Readonly<Record<string, string>>;
  /** Folder groups the user closed in the thread list. */
  readonly collapsedFolderIds: ReadonlyArray<string>;
  /** The order the user dragged each folder's threads into, by thread key. */
  readonly threadOrderByFolder: Readonly<Record<string, ReadonlyArray<string>>>;
}

export const EMPTY_SIDEBAR_FOLDER_STATE: SidebarFolderState = {
  folders: [],
  folderIdByThreadKey: {},
  activeFolderId: null,
  folderChoiceByDraftId: {},
  dismissedSuggestionByThreadKey: {},
  collapsedFolderIds: [],
  threadOrderByFolder: {},
};

export function normalizeFolderName(name: string): string | null {
  const trimmed = name.trim().replace(/\s+/g, " ");
  return trimmed.length === 0 ? null : trimmed.slice(0, 80);
}

export function createFolder(
  state: SidebarFolderState,
  folder: { readonly id: string; readonly name: string; readonly color?: SidebarFolderColor },
): SidebarFolderState {
  const name = normalizeFolderName(folder.name);
  if (name === null || state.folders.some((candidate) => candidate.id === folder.id)) {
    return state;
  }
  const color = folder.color ?? nextFolderColor(state.folders);
  return { ...state, folders: [...state.folders, { id: folder.id, name, color }] };
}

export function setFolderColor(
  state: SidebarFolderState,
  folderId: string,
  color: SidebarFolderColor,
): SidebarFolderState {
  const folder = state.folders.find((candidate) => candidate.id === folderId);
  if (!folder || folder.color === color) return state;
  return {
    ...state,
    folders: state.folders.map((candidate) =>
      candidate.id === folderId ? { ...candidate, color } : candidate,
    ),
  };
}

export function renameFolder(
  state: SidebarFolderState,
  folderId: string,
  nextName: string,
): SidebarFolderState {
  const name = normalizeFolderName(nextName);
  if (name === null) return state;
  const folder = state.folders.find((candidate) => candidate.id === folderId);
  if (!folder || folder.name === name) return state;
  return {
    ...state,
    folders: state.folders.map((candidate) =>
      candidate.id === folderId ? { ...candidate, name } : candidate,
    ),
  };
}

/** Deleting a folder keeps its threads; they only leave the folder. */
export function deleteFolder(state: SidebarFolderState, folderId: string): SidebarFolderState {
  if (!state.folders.some((candidate) => candidate.id === folderId)) return state;
  return {
    folders: state.folders.filter((candidate) => candidate.id !== folderId),
    folderIdByThreadKey: Object.fromEntries(
      Object.entries(state.folderIdByThreadKey).filter(([, id]) => id !== folderId),
    ),
    activeFolderId: state.activeFolderId === folderId ? null : state.activeFolderId,
    folderChoiceByDraftId: Object.fromEntries(
      Object.entries(state.folderChoiceByDraftId).filter(([, id]) => id !== folderId),
    ),
    dismissedSuggestionByThreadKey: Object.fromEntries(
      Object.entries(state.dismissedSuggestionByThreadKey).filter(([, id]) => id !== folderId),
    ),
    collapsedFolderIds: state.collapsedFolderIds.filter((id) => id !== folderId),
    threadOrderByFolder: Object.fromEntries(
      Object.entries(state.threadOrderByFolder).filter(([id]) => id !== folderId),
    ),
  };
}

/** `folderId` null takes the threads out of any folder. */
export function moveThreadsToFolder(
  state: SidebarFolderState,
  threadKeys: ReadonlyArray<string>,
  folderId: string | null,
): SidebarFolderState {
  if (folderId !== null && !state.folders.some((candidate) => candidate.id === folderId)) {
    return state;
  }
  const folderIdByThreadKey = { ...state.folderIdByThreadKey };
  let changed = false;
  for (const threadKey of threadKeys) {
    if (folderId === null) {
      if (threadKey in folderIdByThreadKey) {
        delete folderIdByThreadKey[threadKey];
        changed = true;
      }
    } else if (folderIdByThreadKey[threadKey] !== folderId) {
      folderIdByThreadKey[threadKey] = folderId;
      changed = true;
    }
  }
  return changed ? { ...state, folderIdByThreadKey } : state;
}

export function setActiveFolder(
  state: SidebarFolderState,
  folderId: string | null,
): SidebarFolderState {
  const next =
    folderId !== null && state.folders.some((candidate) => candidate.id === folderId)
      ? folderId
      : null;
  return state.activeFolderId === next ? state : { ...state, activeFolderId: next };
}

export function toggleFolderCollapsed(
  state: SidebarFolderState,
  folderId: string,
): SidebarFolderState {
  if (!state.folders.some((candidate) => candidate.id === folderId)) return state;
  return {
    ...state,
    collapsedFolderIds: state.collapsedFolderIds.includes(folderId)
      ? state.collapsedFolderIds.filter((id) => id !== folderId)
      : [...state.collapsedFolderIds, folderId],
  };
}

export function setFolderThreadOrder(
  state: SidebarFolderState,
  folderId: string,
  threadKeys: ReadonlyArray<string>,
): SidebarFolderState {
  if (!state.folders.some((candidate) => candidate.id === folderId)) return state;
  const current = state.threadOrderByFolder[folderId] ?? [];
  if (current.length === threadKeys.length && current.every((key, i) => key === threadKeys[i])) {
    return state;
  }
  return {
    ...state,
    threadOrderByFolder: { ...state.threadOrderByFolder, [folderId]: [...threadKeys] },
  };
}

export type FolderPositionMove = "top" | "up" | "down" | "bottom";

/** The folder's row order after moving one row; unchanged when it cannot move. */
export function moveInFolderOrder(
  order: ReadonlyArray<string>,
  threadKey: string,
  move: FolderPositionMove,
): ReadonlyArray<string> {
  const index = order.indexOf(threadKey);
  if (index === -1) return order;
  const target =
    move === "top" ? 0 : move === "bottom" ? order.length - 1 : index + (move === "up" ? -1 : 1);
  if (target < 0 || target >= order.length || target === index) return order;
  const next = order.filter((key) => key !== threadKey);
  next.splice(target, 0, threadKey);
  return next;
}

/** The folder's row order after dropping a row just before or after another one. */
export function placeInFolderOrder(
  order: ReadonlyArray<string>,
  draggedKey: string,
  targetKey: string,
  edge: "before" | "after",
): ReadonlyArray<string> {
  if (draggedKey === targetKey) return order;
  const next = order.filter((key) => key !== draggedKey);
  const target = next.indexOf(targetKey);
  if (target === -1) return order;
  next.splice(edge === "before" ? target : target + 1, 0, draggedKey);
  return next;
}

export interface FolderThreadGroup<T> {
  readonly folder: SidebarFolder;
  readonly threads: ReadonlyArray<T>;
}

/**
 * Splits a list into unfiled threads and one group per folder, in folder
 * order; empty folders get no group. Unfiled threads keep the list's order.
 * In a group, threads the user never placed come first in list order, then
 * the placed ones in the order the user dragged them into.
 */
export function groupThreadsByFolder<T>(
  threads: ReadonlyArray<T>,
  keyOf: (thread: T) => string,
  folders: ReadonlyArray<SidebarFolder>,
  folderIdByThreadKey: Readonly<Record<string, string>>,
  threadOrderByFolder: Readonly<Record<string, ReadonlyArray<string>>> = {},
): { readonly unfiled: ReadonlyArray<T>; readonly groups: ReadonlyArray<FolderThreadGroup<T>> } {
  const unfiled: T[] = [];
  const byFolder = new Map<string, T[]>(folders.map((folder) => [folder.id, []]));
  for (const thread of threads) {
    const bucket = byFolder.get(folderIdByThreadKey[keyOf(thread)] ?? "");
    if (bucket) bucket.push(thread);
    else unfiled.push(thread);
  }
  return {
    unfiled,
    groups: folders.flatMap((folder) => {
      const grouped = byFolder.get(folder.id) ?? [];
      if (grouped.length === 0) return [];
      const rank = new Map((threadOrderByFolder[folder.id] ?? []).map((key, i) => [key, i]));
      const unplaced = grouped.filter((thread) => !rank.has(keyOf(thread)));
      const placed = grouped
        .filter((thread) => rank.has(keyOf(thread)))
        .toSorted((a, b) => rank.get(keyOf(a))! - rank.get(keyOf(b))!);
      return [{ folder, threads: [...unplaced, ...placed] }];
    }),
  };
}

export function dismissSuggestion(
  state: SidebarFolderState,
  threadKey: string,
  folderId: string,
): SidebarFolderState {
  if (state.dismissedSuggestionByThreadKey[threadKey] === folderId) return state;
  return {
    ...state,
    dismissedSuggestionByThreadKey: {
      ...state.dismissedSuggestionByThreadKey,
      [threadKey]: folderId,
    },
  };
}

export function setDraftFolderChoice(
  state: SidebarFolderState,
  draftId: string,
  folderId: string | null,
): SidebarFolderState {
  const choice = folderId ?? NO_FOLDER_CHOICE;
  if (choice !== NO_FOLDER_CHOICE && !state.folders.some((candidate) => candidate.id === choice)) {
    return state;
  }
  if (state.folderChoiceByDraftId[draftId] === choice) return state;
  return { ...state, folderChoiceByDraftId: { ...state.folderChoiceByDraftId, [draftId]: choice } };
}

/**
 * The folder a draft lands in: the user's choice, else the folder the sidebar is
 * scoped to, so a thread started while looking at a folder stays in it.
 */
export function resolveDraftFolderId(state: SidebarFolderState, draftId: string): string | null {
  const choice = state.folderChoiceByDraftId[draftId];
  if (choice === NO_FOLDER_CHOICE) return null;
  const folderId = choice ?? state.activeFolderId;
  return folderId !== null && state.folders.some((candidate) => candidate.id === folderId)
    ? folderId
    : null;
}

/** Files the promoted thread under its draft's folder and forgets the draft's choice. */
export function settlePromotedDraft(
  state: SidebarFolderState,
  draftId: string,
  threadKey: string,
): SidebarFolderState {
  const folderId = resolveDraftFolderId(state, draftId);
  const { [draftId]: _settled, ...folderChoiceByDraftId } = state.folderChoiceByDraftId;
  const released =
    draftId in state.folderChoiceByDraftId ? { ...state, folderChoiceByDraftId } : state;
  if (folderId === null || threadKey in state.folderIdByThreadKey) return released;
  return moveThreadsToFolder(released, [threadKey], folderId);
}

/** The folder every key shares, or null when they differ or any key has none. */
export function sharedFolderId(
  folderIdByThreadKey: Readonly<Record<string, string>>,
  threadKeys: ReadonlyArray<string>,
): string | null {
  const [first, ...rest] = threadKeys;
  if (first === undefined) return null;
  const folderId = folderIdByThreadKey[first] ?? null;
  return rest.every((key) => (folderIdByThreadKey[key] ?? null) === folderId) ? folderId : null;
}

export function countThreadsByFolder(
  folderIdByThreadKey: Readonly<Record<string, string>>,
  liveThreadKeys: ReadonlySet<string>,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const [threadKey, folderId] of Object.entries(folderIdByThreadKey)) {
    if (!liveThreadKeys.has(threadKey)) continue;
    counts.set(folderId, (counts.get(folderId) ?? 0) + 1);
  }
  return counts;
}

export function parseSidebarFolderState(value: unknown): SidebarFolderState {
  if (!value || typeof value !== "object") return EMPTY_SIDEBAR_FOLDER_STATE;
  const raw = value as Record<string, unknown>;
  const folders: SidebarFolder[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw.folders)) {
    for (const entry of raw.folders) {
      if (!entry || typeof entry !== "object") continue;
      const { id, name, color } = entry as Record<string, unknown>;
      if (typeof id !== "string" || id.length === 0 || seen.has(id)) continue;
      const normalized = typeof name === "string" ? normalizeFolderName(name) : null;
      if (normalized === null) continue;
      seen.add(id);
      // Folders saved before colors existed get the next free one.
      folders.push({
        id,
        name: normalized,
        color: isSidebarFolderColor(color) ? color : nextFolderColor(folders),
      });
    }
  }
  const folderIdByThreadKey: Record<string, string> = {};
  if (raw.folderIdByThreadKey && typeof raw.folderIdByThreadKey === "object") {
    for (const [threadKey, folderId] of Object.entries(raw.folderIdByThreadKey)) {
      if (typeof folderId === "string" && seen.has(folderId)) {
        folderIdByThreadKey[threadKey] = folderId;
      }
    }
  }
  const activeFolderId =
    typeof raw.activeFolderId === "string" && seen.has(raw.activeFolderId)
      ? raw.activeFolderId
      : null;
  const folderChoiceByDraftId: Record<string, DraftFolderChoice> = {};
  if (raw.folderChoiceByDraftId && typeof raw.folderChoiceByDraftId === "object") {
    for (const [draftId, choice] of Object.entries(raw.folderChoiceByDraftId)) {
      if (typeof choice === "string" && (choice === NO_FOLDER_CHOICE || seen.has(choice))) {
        folderChoiceByDraftId[draftId] = choice;
      }
    }
  }
  const dismissedSuggestionByThreadKey: Record<string, string> = {};
  if (
    raw.dismissedSuggestionByThreadKey &&
    typeof raw.dismissedSuggestionByThreadKey === "object"
  ) {
    for (const [threadKey, folderId] of Object.entries(raw.dismissedSuggestionByThreadKey)) {
      if (typeof folderId === "string" && seen.has(folderId)) {
        dismissedSuggestionByThreadKey[threadKey] = folderId;
      }
    }
  }
  const collapsedFolderIds = Array.isArray(raw.collapsedFolderIds)
    ? raw.collapsedFolderIds.filter(
        (id, index, all): id is string =>
          typeof id === "string" && seen.has(id) && all.indexOf(id) === index,
      )
    : [];
  const threadOrderByFolder: Record<string, ReadonlyArray<string>> = {};
  if (raw.threadOrderByFolder && typeof raw.threadOrderByFolder === "object") {
    for (const [folderId, keys] of Object.entries(raw.threadOrderByFolder)) {
      if (seen.has(folderId) && Array.isArray(keys)) {
        threadOrderByFolder[folderId] = keys.filter(
          (key): key is string => typeof key === "string",
        );
      }
    }
  }
  return {
    folders,
    folderIdByThreadKey,
    activeFolderId,
    folderChoiceByDraftId,
    dismissedSuggestionByThreadKey,
    collapsedFolderIds,
    threadOrderByFolder,
  };
}
