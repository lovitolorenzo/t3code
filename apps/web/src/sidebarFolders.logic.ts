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

export interface SidebarFolderState {
  readonly folders: ReadonlyArray<SidebarFolder>;
  readonly folderIdByThreadKey: Readonly<Record<string, string>>;
  readonly activeFolderId: string | null;
}

export const EMPTY_SIDEBAR_FOLDER_STATE: SidebarFolderState = {
  folders: [],
  folderIdByThreadKey: {},
  activeFolderId: null,
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
  return { folders, folderIdByThreadKey, activeFolderId };
}
