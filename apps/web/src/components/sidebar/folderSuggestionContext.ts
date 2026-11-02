import { createContext, useContext } from "react";

const EMPTY: ReadonlyMap<string, string> = new Map();

/** Suggested folder id by thread key, for rows that are not in a folder yet. */
export const FolderSuggestionContext = createContext<ReadonlyMap<string, string>>(EMPTY);

export function useFolderSuggestion(threadKey: string): string | null {
  return useContext(FolderSuggestionContext).get(threadKey) ?? null;
}
