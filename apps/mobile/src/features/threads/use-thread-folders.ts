import { useAtomSet, useAtomValue } from "@effect/atom-react";
import {
  EMPTY_SIDEBAR_FOLDER_STATE,
  SIDEBAR_FOLDER_COLORS,
  createFolder,
  deleteFolder,
  exportSidebarFolders,
  importSidebarFolders,
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
import type { ThreadListV2FolderGroup } from "./threadListV2";

/**
 * Thread folders on this device. They live only here; copying and pasting them as text carries
 * them to and from a desktop or web client.
 */
export function useThreadFolders() {
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const loaded = AsyncResult.isSuccess(preferencesResult);
  const folders =
    (loaded ? preferencesResult.value.threadFolders : undefined) ?? EMPTY_SIDEBAR_FOLDER_STATE;

  // Transforms read optimistic state so same-frame edits build on each other.
  const update = (transform: (state: SidebarFolderState) => SidebarFolderState) => {
    if (!loaded) return;
    savePreferences({
      transform: (current) => ({
        threadFolders: transform(current.threadFolders ?? EMPTY_SIDEBAR_FOLDER_STATE),
      }),
    });
  };

  const toggleFolder = (folderId: string) =>
    update((state) => toggleFolderCollapsed(state, folderId));

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
    toggleFolder,
    promptNewFolder,
    handleThreadFolderAction,
    handleFolderMenuAction,
    copyFolders,
    pasteFolders,
  } as const;
}
