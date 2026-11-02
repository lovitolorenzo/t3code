import { create } from "zustand";

export type FolderNameRequest = {
  readonly title: string;
  readonly submitLabel: string;
  readonly initialName: string;
  readonly resolve: (name: string | null) => void;
};
export const useFolderNameRequest = create<{ request: FolderNameRequest | null }>(() => ({
  request: null,
}));

/** Asks for a folder name; resolves null when cancelled. */
export function requestFolderName(input: {
  readonly title: string;
  readonly submitLabel: string;
  readonly initialName?: string;
}): Promise<string | null> {
  useFolderNameRequest.getState().request?.resolve(null);
  return new Promise((resolve) =>
    useFolderNameRequest.setState({
      request: {
        title: input.title,
        submitLabel: input.submitLabel,
        initialName: input.initialName ?? "",
        resolve,
      },
    }),
  );
}

export function finishFolderNameRequest(name: string | null) {
  const request = useFolderNameRequest.getState().request;
  useFolderNameRequest.setState({ request: null });
  request?.resolve(name);
}
