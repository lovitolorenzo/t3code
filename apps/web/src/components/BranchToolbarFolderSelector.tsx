import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { FolderClosedIcon, FolderPlusIcon, FolderXIcon } from "lucide-react";
import { memo } from "react";

import { requestNewFolder, useSidebarFolderStore } from "../sidebarFolderStore";
import { resolveDraftFolderId, SIDEBAR_FOLDER_COLORS } from "../sidebarFolders.logic";
import { ComposerSelectControl } from "./chat/ComposerControl";
import { useComposerMenuProps } from "./chat/composerEventScope";
import { ComposerContextLabel } from "./ComposerContextLabel";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectValue,
} from "./ui/select";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

const NO_FOLDER_VALUE = "none";
const NEW_FOLDER_VALUE = "new";

/**
 * Picks the sidebar folder for the thread. A draft keeps the choice until it
 * becomes a thread; a started thread moves at once.
 */
export const BranchToolbarFolderSelector = memo(function BranchToolbarFolderSelector(props: {
  readonly draftId?: string;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const { draftId, environmentId, threadId } = props;
  const composerFloatingLayerProps = useComposerMenuProps();
  const threadKey = scopedThreadKey(scopeThreadRef(environmentId, threadId));
  const folders = useSidebarFolderStore((store) => store.folders);
  const currentId = useSidebarFolderStore((store) =>
    draftId === undefined
      ? (store.folderIdByThreadKey[threadKey] ?? null)
      : resolveDraftFolderId(store, draftId),
  );
  const current = folders.find((folder) => folder.id === currentId) ?? null;
  const assign = (folderId: string | null) => {
    const store = useSidebarFolderStore.getState();
    if (draftId === undefined) store.moveThreads([threadKey], folderId);
    else store.setDraftFolder(draftId, folderId);
  };
  const items = [
    { value: NO_FOLDER_VALUE, label: "No folder" },
    ...folders.map((folder) => ({ value: folder.id, label: folder.name })),
    { value: NEW_FOLDER_VALUE, label: "New folder…" },
  ];

  return (
    <Select
      modal={false}
      value={current?.id ?? NO_FOLDER_VALUE}
      items={items}
      onValueChange={(value: string | null) => {
        if (value === NEW_FOLDER_VALUE) {
          void requestNewFolder().then((folderId) => {
            if (folderId !== null) assign(folderId);
          });
          return;
        }
        assign(value === null || value === NO_FOLDER_VALUE ? null : value);
      }}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <ComposerSelectControl
              size="xs"
              className="min-w-0 shrink"
              aria-label="Sidebar folder"
              data-composer-context-control
            />
          }
        >
          <FolderClosedIcon
            className="size-3"
            style={current ? { color: SIDEBAR_FOLDER_COLORS[current.color] } : undefined}
          />
          <ComposerContextLabel>
            <SelectValue />
          </ComposerContextLabel>
        </TooltipTrigger>
        <TooltipPopup>
          {current ? `In folder ${current.name}` : "Not in a sidebar folder"}
        </TooltipPopup>
      </Tooltip>
      <SelectPopup alignItemWithTrigger={false} {...composerFloatingLayerProps}>
        <SelectGroup>
          <SelectGroupLabel>Sidebar folder</SelectGroupLabel>
          <SelectItem value={NO_FOLDER_VALUE}>
            <span className="inline-flex items-center gap-1.5">
              <FolderXIcon className="size-3" />
              No folder
            </span>
          </SelectItem>
          {folders.map((folder) => (
            <SelectItem key={folder.id} value={folder.id}>
              <span className="inline-flex items-center gap-1.5">
                <FolderClosedIcon
                  className="size-3"
                  style={{ color: SIDEBAR_FOLDER_COLORS[folder.color] }}
                />
                {folder.name}
              </span>
            </SelectItem>
          ))}
          <SelectItem value={NEW_FOLDER_VALUE}>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <FolderPlusIcon className="size-3" />
              New folder…
            </span>
          </SelectItem>
        </SelectGroup>
      </SelectPopup>
    </Select>
  );
});
