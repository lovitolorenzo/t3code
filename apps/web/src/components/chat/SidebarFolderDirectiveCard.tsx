import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { FolderClosedIcon, FolderOutputIcon } from "lucide-react";
import { useEffect } from "react";

import {
  findFolderByName,
  parseFolderDirective,
  type SidebarFolderDirective,
} from "../../sidebarFolderDirective.logic";
import { applyFolderDirectiveOnce, useSidebarFolderStore } from "../../sidebarFolderStore";
import { SIDEBAR_FOLDER_COLORS } from "../../sidebarFolders.logic";

/** An agent's folder block: files the threads once the block is complete, then says so. */
export function SidebarFolderDirectiveCard(props: {
  directive: SidebarFolderDirective;
  code: string;
  threadRef: ScopedThreadRef;
  complete: boolean;
}) {
  const { directive, code, complete } = props;
  const threadKey = scopedThreadKey(props.threadRef);
  const environmentId = props.threadRef.environmentId;
  // oxlint-disable-next-line t3code/react-effect-budget -- Writes the agent's request to the client folder store once the block finishes streaming.
  useEffect(() => {
    if (!complete) return;
    const parsed = parseFolderDirective(code);
    if (parsed !== null) applyFolderDirectiveOnce(parsed, { threadKey, environmentId, code });
  }, [complete, code, threadKey, environmentId]);
  const folder = useSidebarFolderStore((store) =>
    directive.folder === null ? undefined : findFolderByName(store, directive.folder),
  );
  const count = directive.threads.length;
  const threads = count === 1 ? "1 thread" : `${count} threads`;
  return (
    <div
      role="status"
      className="my-2 flex w-fit max-w-full items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground"
    >
      {directive.folder === null ? (
        <>
          <FolderOutputIcon aria-hidden className="size-3.5 shrink-0" />
          <span>Took {threads} out of their folders</span>
        </>
      ) : (
        <>
          <FolderClosedIcon
            aria-hidden
            className="size-3.5 shrink-0"
            style={folder ? { color: SIDEBAR_FOLDER_COLORS[folder.color] } : undefined}
          />
          <span className="min-w-0 truncate">
            {complete ? "Moved" : "Moving"} {threads} to{" "}
            <span className="font-medium text-foreground">{folder?.name ?? directive.folder}</span>
            {directive.main !== undefined ? ", with a main thread" : null}
          </span>
        </>
      )}
    </div>
  );
}
