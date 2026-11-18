import {
  SIDEBAR_FOLDER_MIRROR_FILE,
  parseSidebarFolderMirror,
  type SidebarFolderMirror,
} from "@t3tools/client-runtime/state/thread-folders";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { AppState } from "react-native";

import { projectEnvironment } from "../../state/projects";
import { environmentServerConfigsAtom } from "../../state/server";
import { workspaceConnections } from "../../state/workspace";

const MIRROR_REFRESH_MS = 60_000;

// Not gated on the connection: a reconnecting environment keeps its last answer, so the
// folders do not fall back to this device's own each time the app resumes.
const mirrorFileAtomsAtom = Atom.make((get) => {
  const configs = get(environmentServerConfigsAtom);
  return get(workspaceConnections.environmentsAtom).flatMap((environment) => {
    const cwd = configs.get(environment.environmentId)?.scratchWorkspaceRoot;
    return environment.isEnabled && cwd !== undefined
      ? [
          projectEnvironment.readFile({
            environmentId: environment.environmentId,
            input: { cwd, relativePath: SIDEBAR_FOLDER_MIRROR_FILE, allowMissing: true },
          }),
        ]
      : [];
  });
}).pipe(Atom.withLabel("mobile:thread-folder-mirror-files"));

interface FolderMirrors {
  readonly contents: ReadonlyArray<string>;
  readonly mirrors: ReadonlyArray<SidebarFolderMirror>;
}

/** The folders each computer mirrors into its environment's Scratch folder; empty ones count as none. */
export const folderMirrorsAtom = Atom.make((get): FolderMirrors => {
  const contents = get(mirrorFileAtomsAtom).flatMap((atom) => {
    const file = Option.getOrNull(AsyncResult.value(get(atom)));
    return file === null || file.exists === false || file.truncated ? [] : [file.contents];
  });
  // Polls mostly return the same files; keeping the value spares the thread list a rebuild.
  const previous = Option.getOrUndefined(get.self<FolderMirrors>());
  if (
    previous !== undefined &&
    previous.contents.length === contents.length &&
    previous.contents.every((text, index) => text === contents[index])
  ) {
    return previous;
  }
  return {
    contents,
    mirrors: contents.flatMap((text) => {
      const mirror = parseSidebarFolderMirror(text);
      return mirror === null || mirror.folders.length === 0 ? [] : [mirror];
    }),
  };
}).pipe(Atom.withLabel("mobile:thread-folder-mirrors"));

/** Mount while the mirrors are shown: rereads them on return to the app and every minute in it. */
export const folderMirrorRefreshAtom = Atom.make((get) => {
  const refresh = () => {
    for (const atom of get.registry.get(mirrorFileAtomsAtom)) get.registry.refresh(atom);
  };
  const interval = setInterval(() => {
    if (AppState.currentState === "active") refresh();
  }, MIRROR_REFRESH_MS);
  const subscription = AppState.addEventListener("change", (state) => {
    if (state === "active") refresh();
  });
  get.addFinalizer(() => {
    clearInterval(interval);
    subscription.remove();
  });
  return null;
}).pipe(Atom.withLabel("mobile:thread-folder-mirror-refresh"));
