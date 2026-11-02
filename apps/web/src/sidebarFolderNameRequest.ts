import { create } from "zustand";

import type { SidebarFolderColor } from "./sidebarFolders.logic";

export interface FolderDetails {
  readonly name: string;
  readonly color: SidebarFolderColor;
}

export type FolderDetailsRequest = {
  readonly title: string;
  readonly submitLabel: string;
  readonly initial: FolderDetails;
  readonly resolve: (details: FolderDetails | null) => void;
};
export const useFolderDetailsRequest = create<{ request: FolderDetailsRequest | null }>(() => ({
  request: null,
}));

/** Asks for a folder's name and color; resolves null when cancelled. */
export function requestFolderDetails(input: {
  readonly title: string;
  readonly submitLabel: string;
  readonly initial: FolderDetails;
}): Promise<FolderDetails | null> {
  useFolderDetailsRequest.getState().request?.resolve(null);
  return new Promise((resolve) =>
    useFolderDetailsRequest.setState({ request: { ...input, resolve } }),
  );
}

export function finishFolderDetailsRequest(details: FolderDetails | null) {
  const request = useFolderDetailsRequest.getState().request;
  useFolderDetailsRequest.setState({ request: null });
  request?.resolve(details);
}
