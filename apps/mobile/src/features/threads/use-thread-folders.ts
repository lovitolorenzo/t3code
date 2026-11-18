import { useAtomMount, useAtomSet, useAtomValue } from "@effect/atom-react";
import {
  EMPTY_SIDEBAR_FOLDER_STATE,
  SIDEBAR_FOLDER_COLORS,
  createFolder,
  deleteFolder,
  exportSidebarFolders,
  importSidebarFolders,
  mergeSidebarFolderMirrors,
  moveThreadsToFolder,
  renameFolder,
  setFolderColor,
  setFolderMainThread,
  toggleFolderCollapsed,
  type SidebarFolderColor,
  type SidebarFolderState,
} from "@t3tools/client-runtime/state/thread-folders";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { AsyncResult } from "effect/reactivity";
import * as Clipboard from "expo-clipboard";

import * as Dialog from "../../components/ui/Dialog";
import { scopedThreadKey } from "../../lib/scopedEntities";
import { uuidv4 } from "../../lib/uuid";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { folderMirrorRefreshAtom, folderMirrorsAtom } from "./thread-folder-mirrors";
import type { ThreadListV2FolderGroup } from "./threadListV2";

const NO_FOLDER_IDS: ReadonlyArray<string> = [];

/**
 * Thread folders on this device. When a computer mirrors its folders into a connected
 * environment, the device shows every computer's folders, read-only; otherwise it shows its
 * own, which copying and pasting as text carries to and from a desktop or web client.
 */
export function useThreadFolders() {
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const { mirrors } = useAtomValue(folderMirrorsAtom);
  useAtomMount(folderMirrorRefreshAtom);
  const loaded = AsyncResult.isSuccess(preferencesResult);
  const readOnly = mirrors.length > 0;
  const folders = readOnly
    ? mergeSidebarFolderMirrors(
        mirrors,
        (loaded ? preferencesResult.value.mirroredFolderCollapsedIds : undefined) ?? NO_FOLDER_IDS,
      )
    : ((loaded ? preferencesResult.value.threadFolders : undefined) ?? EMPTY_SIDEBAR_FOLDER_STATE);

  // Transforms read optimistic state so same-frame edits build on each other.
  const update = (transform: (state: SidebarFolderState) => SidebarFolderState) => {
    if (!loaded || readOnly) return;
    savePreferences({
      transform: (current) => ({
        threadFolders: transform(current.threadFolders ?? EMPTY_SIDEBAR_FOLDER_STATE),
      }),
    });
  };

  const toggleFolder = (folderId: string) => {
    if (!readOnly) {
      update((state) => toggleFolderCollapsed(state, folderId));
      return;
    }
    if (!loaded) return;
    const shown = new Set(folders.folders.map((folder) => folder.id));
    savePreferences({
      transform: (current) => {
        const collapsed = (current.mirroredFolderCollapsedIds ?? []).filter((id) => shown.has(id));
        return {
          mirroredFolderCollapsedIds: collapsed.includes(folderId)
            ? collapsed.filter((id) => id !== folderId)
            : [...collapsed, folderId],
        };
      },
    });
  };

  /** Asks for a name, creates the folder and files `threadKeys` in it. */
  const promptNewFolder = (threadKeys: ReadonlyArray<string> = []) =>
    Dialog.prompt({
      title: "New folder",
      initialValue: "",
      confirmText: "Create",
      onConfirm: (name) => {
        const id = uuidv4();
        update((state) => {
          const created = createFolder(state, { id, name });
          return created === state ? state : moveThreadsToFolder(created, threadKeys, id);
        });
      },
    });

  const promptRenameFolder = (folderId: string) =>
    Dialog.prompt({
      title: "Rename folder",
      confirmText: "Rename",
      initialValue: folders.folders.find((folder) => folder.id === folderId)?.name ?? "",
      onConfirm: (name) => update((state) => renameFolder(state, folderId, name)),
    });

  const confirmDeleteFolder = (folderId: string) =>
    Dialog.confirm({
      title: `Delete "${folders.folders.find((folder) => folder.id === folderId)?.name ?? "folder"}"?`,
      message: "Its threads stay, outside any folder.",
      confirmText: "Delete",
      destructive: true,
      onConfirm: () => update((state) => deleteFolder(state, folderId)),
    });

  /** Runs a thread row's Folder menu action; rows can outlive a render, so it reads stored state. */
  const handleThreadFolderAction = (thread: EnvironmentThreadShell, actionId: string) => {
    const threadKey = scopedThreadKey(thread.environmentId, thread.id);
    if (actionId === "folder-new") {
      promptNewFolder([threadKey]);
    } else if (actionId === "folder-none") {
      update((state) => moveThreadsToFolder(state, [threadKey], null));
    } else if (actionId === "folder-main") {
      update((state) => {
        const folderId = state.folderIdByThreadKey[threadKey];
        if (folderId === undefined) return state;
        const isMain = state.mainThreadKeyByFolder[folderId] === threadKey;
        return setFolderMainThread(state, folderId, isMain ? null : threadKey);
      });
    } else if (actionId.startsWith("folder:")) {
      const folderId = actionId.slice("folder:".length);
      update((state) => moveThreadsToFolder(state, [threadKey], folderId));
    }
  };

  const handleFolderMenuAction = (
    group: ThreadListV2FolderGroup,
    actionId: string,
    actions: {
      readonly settleThread: (thread: EnvironmentThreadShell) => Promise<boolean>;
      readonly openThread: (thread: EnvironmentThreadShell) => void;
    },
  ) => {
    const folderId = group.folder.id;
    if (actionId === "open-main" && group.mainThread) actions.openThread(group.mainThread);
    if (actionId === "settle") {
      for (const thread of group.settleableThreads) void actions.settleThread(thread);
    }
    if (actionId === "rename") promptRenameFolder(folderId);
    if (actionId === "delete") confirmDeleteFolder(folderId);
    if (actionId.startsWith("color:")) {
      const color = actionId.slice("color:".length);
      if (Object.hasOwn(SIDEBAR_FOLDER_COLORS, color)) {
        update((state) => setFolderColor(state, folderId, color as SidebarFolderColor));
      }
    }
  };

  const copyFolders = async () => {
    await Clipboard.setStringAsync(exportSidebarFolders(folders));
    Dialog.alert(
      "Folders copied",
      'On your computer, right-click a folder in the T3 Code sidebar and choose "Paste folders". It replaces the folders there.',
    );
  };

  const pasteFolders = async () => {
    if (!loaded) return;
    const text = (await Clipboard.getStringAsync()) ?? "";
    const imported = importSidebarFolders(folders, text);
    if (imported === null) {
      Dialog.alert(
        "No folders to paste",
        'On your computer, right-click a folder in the T3 Code sidebar, choose "Copy folders for mobile", then paste here.',
      );
      return;
    }
    const paste = () => update((state) => importSidebarFolders(state, text) ?? imported);
    if (folders.folders.length === 0) {
      paste();
      return;
    }
    Dialog.confirm({
      title: "Replace this phone's folders?",
      message: `The pasted ${imported.folders.length === 1 ? "folder replaces" : `${imported.folders.length} folders replace`} the ${folders.folders.length} here.`,
      confirmText: "Replace",
      onConfirm: paste,
    });
  };

  return {
    folders,
    readOnly,
    toggleFolder,
    handleFolderMenuAction,
    /** Undefined while the folders are mirrored, which hides the thread menu's Folder submenu. */
    handleThreadFolderAction: readOnly ? undefined : handleThreadFolderAction,
    /** The thread list's Folders menu, or undefined while the folders are mirrored. */
    listActions: readOnly
      ? undefined
      : {
          count: folders.folders.length,
          onNew: () => promptNewFolder(),
          onPaste: () => void pasteFolders(),
          onCopy: () => void copyFolders(),
        },
  } as const;
}
