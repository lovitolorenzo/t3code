import { describe, expect, it } from "vite-plus/test";

import {
  EMPTY_SIDEBAR_FOLDER_STATE,
  countThreadsByFolder,
  createFolder,
  deleteFolder,
  moveThreadsToFolder,
  parseSidebarFolderState,
  renameFolder,
  setActiveFolder,
  sharedFolderId,
} from "./sidebarFolders.logic";

const withFolders = createFolder(
  createFolder(EMPTY_SIDEBAR_FOLDER_STATE, { id: "ci", name: " CI " }),
  {
    id: "docs",
    name: "Docs",
  },
);

describe("sidebar folders", () => {
  it("creates folders with trimmed names and ignores blank names", () => {
    expect(withFolders.folders).toEqual([
      { id: "ci", name: "CI" },
      { id: "docs", name: "Docs" },
    ]);
    expect(createFolder(withFolders, { id: "blank", name: "   " })).toBe(withFolders);
  });

  it("moves threads between folders and out of them", () => {
    const moved = moveThreadsToFolder(withFolders, ["env:a", "env:b"], "ci");
    expect(moved.folderIdByThreadKey).toEqual({ "env:a": "ci", "env:b": "ci" });
    const regrouped = moveThreadsToFolder(moved, ["env:b"], "docs");
    expect(regrouped.folderIdByThreadKey).toEqual({ "env:a": "ci", "env:b": "docs" });
    const removed = moveThreadsToFolder(regrouped, ["env:a"], null);
    expect(removed.folderIdByThreadKey).toEqual({ "env:b": "docs" });
    expect(moveThreadsToFolder(removed, ["env:a"], "missing")).toBe(removed);
  });

  it("deleting a folder releases its threads and clears it as the filter", () => {
    const state = setActiveFolder(moveThreadsToFolder(withFolders, ["env:a"], "ci"), "ci");
    const next = deleteFolder(state, "ci");
    expect(next.folders.map((folder) => folder.id)).toEqual(["docs"]);
    expect(next.folderIdByThreadKey).toEqual({});
    expect(next.activeFolderId).toBeNull();
  });

  it("renames only to a non-blank name", () => {
    expect(renameFolder(withFolders, "ci", "Pipelines").folders[0]).toEqual({
      id: "ci",
      name: "Pipelines",
    });
    expect(renameFolder(withFolders, "ci", "  ")).toBe(withFolders);
  });

  it("reports the folder a selection shares", () => {
    const state = moveThreadsToFolder(withFolders, ["env:a", "env:b"], "ci");
    expect(sharedFolderId(state.folderIdByThreadKey, ["env:a", "env:b"])).toBe("ci");
    expect(sharedFolderId(state.folderIdByThreadKey, ["env:a", "env:c"])).toBeNull();
  });

  it("counts only threads that still exist", () => {
    const state = moveThreadsToFolder(withFolders, ["env:a", "env:gone"], "ci");
    expect(countThreadsByFolder(state.folderIdByThreadKey, new Set(["env:a"])).get("ci")).toBe(1);
  });

  it("drops stored entries that point at missing folders", () => {
    expect(
      parseSidebarFolderState({
        folders: [
          { id: "ci", name: "CI" },
          { id: "ci", name: "Dup" },
          { id: "x", name: "" },
        ],
        folderIdByThreadKey: { "env:a": "ci", "env:b": "x" },
        activeFolderId: "x",
      }),
    ).toEqual({
      folders: [{ id: "ci", name: "CI" }],
      folderIdByThreadKey: { "env:a": "ci" },
      activeFolderId: null,
    });
    expect(parseSidebarFolderState("garbage")).toEqual(EMPTY_SIDEBAR_FOLDER_STATE);
  });
});
