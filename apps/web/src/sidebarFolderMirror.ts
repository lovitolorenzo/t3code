import { availableScratchWorkspaceRoot } from "@t3tools/client-runtime/operations/projects";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import {
  SIDEBAR_FOLDER_MIRROR_FILE,
  exportSidebarFolders,
  serializeSidebarFolderMirror,
} from "@t3tools/client-runtime/state/thread-folders";
import type { EnvironmentId } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import { appAtomRegistry } from "./rpc/atomRegistry";
import { useSidebarFolderStore } from "./sidebarFolderStore";
import { environmentPresentations } from "./state/presentation";
import { primaryEnvironmentIdAtom } from "./state/primaryEnvironment";
import { projectEnvironment } from "./state/projects";

const MIRROR_DEBOUNCE_MS = 2_000;

interface MirrorTarget {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
}

/** This client's own environment's Scratch folder, while it is connected and accepts writes. */
const mirrorTargetAtom = Atom.make((get): MirrorTarget | null => {
  const environmentId = get(primaryEnvironmentIdAtom);
  if (environmentId === null) return null;
  const presentation = get(environmentPresentations.presentationAtom(environmentId));
  const cwd = availableScratchWorkspaceRoot(
    presentation?.connection.phase,
    presentation?.serverConfig,
  );
  if (cwd === null || !get(projectEnvironment.writeFile.permissionAtom(environmentId))) return null;
  return { environmentId, cwd };
}).pipe(Atom.withLabel("web-sidebar-folder-mirror-target"));

const targetKey = (target: MirrorTarget | null) =>
  target === null ? null : `${target.environmentId}\n${target.cwd}`;

/**
 * Mirrors the sidebar folders into a file in this client's own environment, so the mobile
 * app can show every computer's folders. Failures only log: the folders still work here.
 */
export function startSidebarFolderMirror(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let rerun = false;
  let written: { readonly target: string; readonly content: string } | null = null;
  const openedScratch = new Set<EnvironmentId>();

  const sync = async () => {
    const target = appAtomRegistry.get(mirrorTargetAtom);
    if (target === null) return;
    const state = useSidebarFolderStore.getState();
    const content = exportSidebarFolders(state);
    const key = targetKey(target)!;
    if (written?.target === key && written.content === content) return;
    // A client that never had folders leaves the Scratch project uncreated.
    if (state.folders.length === 0 && written === null) return;
    // Writes need a known workspace, and the Scratch folder is one once its project exists.
    if (!openedScratch.has(target.environmentId)) {
      const opened = await runAtomCommand(appAtomRegistry, projectEnvironment.openScratch, {
        environmentId: target.environmentId,
        input: {},
      });
      if (opened._tag !== "Success") return;
      openedScratch.add(target.environmentId);
    }
    const result = await runAtomCommand(appAtomRegistry, projectEnvironment.writeFile, {
      environmentId: target.environmentId,
      input: {
        cwd: target.cwd,
        relativePath: SIDEBAR_FOLDER_MIRROR_FILE,
        contents: serializeSidebarFolderMirror(state, new Date().toISOString()),
      },
    });
    if (result._tag === "Success") written = { target: key, content };
  };

  const run = async () => {
    timer = null;
    if (running) {
      rerun = true;
      return;
    }
    running = true;
    try {
      await sync();
    } catch (error) {
      console.warn("[sidebar-folder-mirror] sync failed", error);
    } finally {
      running = false;
      if (rerun) {
        rerun = false;
        schedule();
      }
    }
  };

  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => void run(), MIRROR_DEBOUNCE_MS);
  };

  let lastTargetKey: string | null = null;
  const unsubscribes = [
    useSidebarFolderStore.subscribe(schedule),
    appAtomRegistry.subscribe(
      mirrorTargetAtom,
      (target) => {
        const key = targetKey(target);
        if (key === lastTargetKey) return;
        lastTargetKey = key;
        if (key !== null) schedule();
      },
      { immediate: true },
    ),
  ];
  return () => {
    if (timer !== null) clearTimeout(timer);
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}
