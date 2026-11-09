import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";

import { readThreadShells } from "./state/entities";
import { useSidebarFolderStore } from "./sidebarFolderStore";
import { folderMemberStatus, formatFolderMainContext } from "./sidebarFolderMain.logic";

/**
 * The folder block for a message sent from `ref`, or "" when the thread is no folder's main.
 * It lists the folder's other live threads in this environment, in the folder's order, since
 * the agent's T3 tools only reach threads there.
 */
export function folderMainContextFor(ref: ScopedThreadRef): string {
  const store = useSidebarFolderStore.getState();
  const threadKey = scopedThreadKey(ref);
  const folderId = store.folderIdByThreadKey[threadKey];
  const folder = store.folders.find((candidate) => candidate.id === folderId);
  if (!folder || store.mainThreadKeyByFolder[folder.id] !== threadKey) return "";
  const rank = new Map((store.threadOrderByFolder[folder.id] ?? []).map((key, i) => [key, i]));
  const members = readThreadShells()
    .filter(
      (thread) =>
        thread.environmentId === ref.environmentId &&
        thread.id !== ref.threadId &&
        thread.archivedAt === null &&
        thread.deletedAt === null &&
        store.folderIdByThreadKey[
          scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))
        ] === folder.id,
    )
    .toSorted(
      (a, b) =>
        (rank.get(scopedThreadKey(scopeThreadRef(a.environmentId, a.id))) ?? -1) -
        (rank.get(scopedThreadKey(scopeThreadRef(b.environmentId, b.id))) ?? -1),
    )
    .map((thread) => ({
      threadId: thread.id,
      title: thread.title,
      status: folderMemberStatus(thread),
    }));
  return formatFolderMainContext(folder.name, members);
}
