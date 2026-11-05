import { FolderClosedIcon, PlusIcon } from "lucide-react";
import { CollapsibleSectionHeader } from "../ui/collapsible-section-header";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  type DOMAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "~/lib/utils";
import {
  animateSidebarLayoutChanges,
  sidebarMarkerId,
  type SidebarListMarker,
} from "../Sidebar.logic";
import {
  clearFolderRowDropTarget,
  isSidebarFolderRowDrag,
  SIDEBAR_FOLDER_ROW_MIME,
  SIDEBAR_SORTABLE_DRAG_DISABLED,
  useFolderRowDropTarget,
} from "./SidebarThreadRow";

function SortableSidebarMarker(props: {
  marker: SidebarListMarker;
  className?: string;
  children?: ReactNode;
  revealOverflow?: boolean;
  dropHandlers?: Pick<DOMAttributes<HTMLLIElement>, "onDragOver" | "onDragLeave" | "onDrop">;
  "data-testid"?: string;
  "data-folder-header"?: string;
}) {
  const { node, setNodeRef, transform, transition } = useSortable({
    id: sidebarMarkerId(props.marker),
    disabled: SIDEBAR_SORTABLE_DRAG_DISABLED,
    animateLayoutChanges: animateSidebarLayoutChanges,
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps the projected drop box inside the scroll viewport as drag transforms move it
  useLayoutEffect(() => {
    if (props.revealOverflow && transform?.y !== undefined) {
      node.current?.firstElementChild?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [node, props.revealOverflow, transform?.y]);
  return (
    <li
      ref={setNodeRef}
      {...props.dropHandlers}
      data-thread-selection-safe
      data-testid={props["data-testid"]}
      data-folder-header={props["data-folder-header"]}
      className={cn("list-none", props.className)}
      style={{
        transform: CSS.Translate.toString(transform),
        transition: props.marker.endsWith("-placeholder") ? "none" : transition,
        visibility: transform?.scaleY === 0 ? "hidden" : undefined,
      }}
    >
      {props.children}
    </li>
  );
}

export function SidebarSectionPlaceholder(props: {
  marker: "active-placeholder" | "settled-placeholder";
  label: string;
  showHint: boolean;
  isDropTarget: boolean;
  /** Covers the row below it without catching the drag, for a non-empty section. */
  opaque?: boolean;
}) {
  return (
    <SortableSidebarMarker
      marker={props.marker}
      data-testid={`sidebar-${props.marker}`}
      className="relative z-10 mx-0.5 -mb-px h-0"
      revealOverflow={props.marker === "settled-placeholder" && props.showHint}
    >
      {props.showHint ? (
        <div
          className={cn(
            "absolute inset-x-0 top-0 flex h-9 items-center justify-center rounded-md border border-dashed border-sidebar-foreground/25 text-xs text-sidebar-foreground/80",
            props.opaque && "pointer-events-none bg-sidebar",
            props.isDropTarget &&
              (props.opaque
                ? "border-primary/40 bg-linear-to-b from-primary/5 to-primary/5 text-primary"
                : "border-primary/40 bg-primary/5 text-primary"),
          )}
        >
          {props.label}
        </div>
      ) : null}
    </SortableSidebarMarker>
  );
}

export function SidebarDragBoundary(props: {
  marker: "pinned-header" | "pinned-divider";
  label: string;
  visible: boolean;
  isDropTarget: boolean;
}) {
  return (
    <SortableSidebarMarker
      marker={props.marker}
      data-testid={`sidebar-${props.marker}`}
      className="pointer-events-none relative mx-0.5 -mb-px h-0"
    >
      {props.visible ? (
        <div className="sidebar-drag-boundary-label absolute inset-x-2 top-1 flex h-4 items-center gap-2">
          <span
            className={cn(
              "shrink-0 text-xs font-medium",
              props.isDropTarget ? "text-primary" : "text-sidebar-foreground/80",
            )}
          >
            {props.label}
          </span>
          <span
            aria-hidden
            className={cn(
              "h-px flex-1",
              props.isDropTarget ? "bg-primary/50" : "bg-sidebar-foreground/25",
            )}
          />
        </div>
      ) : null}
    </SortableSidebarMarker>
  );
}

export function SidebarSectionHeader(props: {
  marker: "working-header" | "snoozed-header" | "settled-header";
  label: string;
  /** A muted trailing count. */
  count: number;
  className?: string;
  dragging?: boolean;
  isDropTarget?: boolean;
  toggle: { expanded: boolean; onToggle: () => void };
}) {
  const shelf =
    props.marker === "working-header"
      ? "working"
      : props.marker === "snoozed-header"
        ? "snoozed"
        : "settled";
  return (
    <SortableSidebarMarker
      marker={props.marker}
      data-testid={`sidebar-${props.marker}`}
      className={cn("relative mx-0.5 h-8", props.className)}
    >
      <CollapsibleSectionHeader
        role="treeitem"
        tabIndex={-1}
        data-sidebar-row={`shelf:${shelf}`}
        onClick={props.toggle.onToggle}
        expanded={props.toggle.expanded}
        tone={props.isDropTarget ? "accent" : props.dragging ? "emphasized" : "muted"}
        data-testid={`sidebar-${shelf}-shelf-toggle`}
        accessory={<span className="font-normal tabular-nums">{props.count}</span>}
      >
        {props.label}
      </CollapsibleSectionHeader>
    </SortableSidebarMarker>
  );
}

/** The header of an active folder group; it opens and closes the group like a shelf. */
export function SidebarFolderGroupHeader(props: {
  folderId: string;
  name: string;
  color: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  onNewThread: () => void;
  /** A thread dropped on the header moves to the top of this folder. */
  onDropThread: (draggedKey: string) => void;
  renaming: boolean;
  onStartRename: () => void;
  onRename: (name: string) => void;
  onCancelRename: () => void;
  onContextMenu: (position: { x: number; y: number }) => void;
}) {
  const marker = `folder-header:${props.folderId}` as const;
  const isDropTarget = useFolderRowDropTarget((state) => state.targetKey === marker);
  return (
    <SortableSidebarMarker
      marker={marker}
      data-testid="sidebar-folder-group-header"
      data-folder-header={props.folderId}
      className={cn(
        "group/folder-header relative mx-0.5 h-8 rounded-md",
        isDropTarget && "bg-sidebar-row-hover",
      )}
      dropHandlers={{
        onDragOver: (event) => {
          if (!isSidebarFolderRowDrag(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          if (!isDropTarget) useFolderRowDropTarget.setState({ targetKey: marker });
        },
        onDragLeave: (event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null) && isDropTarget) {
            clearFolderRowDropTarget();
          }
        },
        onDrop: (event) => {
          if (!isSidebarFolderRowDrag(event)) return;
          event.preventDefault();
          clearFolderRowDropTarget();
          const draggedKey = event.dataTransfer.getData(SIDEBAR_FOLDER_ROW_MIME);
          if (draggedKey) props.onDropThread(draggedKey);
        },
      }}
    >
      {props.renaming ? (
        <div className="flex h-8 items-center gap-1.5 px-2">
          <FolderClosedIcon
            aria-hidden
            className="size-3.5 shrink-0"
            style={{ color: props.color }}
          />
          <FolderRenameInput
            name={props.name}
            onCommit={props.onRename}
            onCancel={props.onCancelRename}
          />
        </div>
      ) : (
        <CollapsibleSectionHeader
          role="treeitem"
          tabIndex={-1}
          data-sidebar-row={`folder-group:${props.folderId}`}
          onClick={props.onToggle}
          onKeyDown={(event) => {
            if (event.key !== "F2") return;
            event.preventDefault();
            props.onStartRename();
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            props.onContextMenu({ x: event.clientX, y: event.clientY });
          }}
          expanded={props.expanded}
          tone="emphasized"
          accessory={<span className="font-normal tabular-nums">{props.count}</span>}
        >
          <span className="inline-flex max-w-44 items-center gap-1.5">
            <FolderClosedIcon
              aria-hidden
              className="size-3.5 shrink-0"
              style={{ color: props.color }}
            />
            <span
              className="truncate"
              onDoubleClick={(event) => {
                event.stopPropagation();
                props.onStartRename();
              }}
            >
              {props.name}
            </span>
          </span>
        </CollapsibleSectionHeader>
      )}
      {/* A sibling of the toggle, since a button cannot hold another button. */}
      {props.renaming ? null : (
        <button
          type="button"
          aria-label={`New thread in folder ${props.name}`}
          onClick={props.onNewThread}
          className="absolute inset-y-1 right-10 inline-flex w-6 cursor-pointer items-center justify-center rounded-md bg-sidebar text-sidebar-muted-foreground opacity-0 outline-none transition-opacity hover:text-sidebar-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring group-any-hover/folder-header:opacity-100"
        >
          <PlusIcon aria-hidden className="size-3.5" />
        </button>
      )}
    </SortableSidebarMarker>
  );
}

// Mounted only while renaming, so each rename starts from the current name.
function FolderRenameInput(props: {
  name: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(props.name);
  // Enter and Escape blur the input as it unmounts; that blur must not commit again.
  const settledRef = useRef(false);
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter") {
      event.preventDefault();
      settledRef.current = true;
      props.onCommit(name);
    } else if (event.key === "Escape") {
      event.preventDefault();
      settledRef.current = true;
      props.onCancel();
    }
  };
  return (
    <input
      autoFocus
      value={name}
      maxLength={80}
      dir="auto"
      aria-label="Folder name"
      onChange={(event) => setName(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={handleKeyDown}
      onBlur={() => {
        if (!settledRef.current) props.onCommit(name);
      }}
      onPointerDown={(event) => event.stopPropagation()}
      className="min-w-0 flex-1 rounded-sm border border-input bg-card px-1 text-xs font-medium text-card-foreground outline-none focus:border-foreground"
    />
  );
}
