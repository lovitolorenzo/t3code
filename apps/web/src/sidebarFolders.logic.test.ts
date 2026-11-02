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
  setFolderColor,
  groupThreadsByFolder,
  setFolderThreadOrder,
  moveInFolderOrder,
  toggleFolderCollapsed,
  resolveDraftFolderId,
  setDraftFolderChoice,
  settlePromotedDraft,
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
      { id: "ci", name: "CI", color: "blue" },
      { id: "docs", name: "Docs", color: "green" },
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
      color: "blue",
    });
    expect(renameFolder(withFolders, "ci", "  ")).toBe(withFolders);
  });

  it("gives each new folder an unused color and lets it change", () => {
    const recolored = setFolderColor(withFolders, "ci", "green");
    expect(recolored.folders.map((folder) => folder.color)).toEqual(["green", "green"]);
    expect(createFolder(recolored, { id: "ops", name: "Ops" }).folders[2]?.color).toBe("blue");
    expect(setFolderColor(withFolders, "ci", "blue")).toBe(withFolders);
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
          { id: "ops", name: "Ops", color: "teal" },
        ],
        folderIdByThreadKey: { "env:a": "ci", "env:b": "x" },
        activeFolderId: "x",
      }),
    ).toEqual({
      folders: [
        { id: "ci", name: "CI", color: "blue" },
        { id: "ops", name: "Ops", color: "teal" },
      ],
      folderIdByThreadKey: { "env:a": "ci" },
      activeFolderId: null,
      folderChoiceByDraftId: {},
      dismissedSuggestionByThreadKey: {},
      collapsedFolderIds: [],
      threadOrderByFolder: {},
    });
    expect(parseSidebarFolderState("garbage")).toEqual(EMPTY_SIDEBAR_FOLDER_STATE);
  });

  it("files a promoted draft under its chosen folder, or the scoped one", () => {
    const chosen = setDraftFolderChoice(withFolders, "draft-1", "docs");
    const promoted = settlePromotedDraft(chosen, "draft-1", "env:t1");
    expect(promoted.folderIdByThreadKey).toEqual({ "env:t1": "docs" });
    expect(promoted.folderChoiceByDraftId).toEqual({});

    const scoped = setActiveFolder(withFolders, "ci");
    expect(resolveDraftFolderId(scoped, "draft-2")).toBe("ci");
    expect(settlePromotedDraft(scoped, "draft-2", "env:t2").folderIdByThreadKey).toEqual({
      "env:t2": "ci",
    });

    const optedOut = setDraftFolderChoice(scoped, "draft-3", null);
    expect(resolveDraftFolderId(optedOut, "draft-3")).toBeNull();
    expect(settlePromotedDraft(optedOut, "draft-3", "env:t3").folderIdByThreadKey).toEqual({});
  });

  it("keeps a thread's existing folder when its draft is promoted again", () => {
    const filed = moveThreadsToFolder(withFolders, ["env:t1"], "ci");
    const chosen = setDraftFolderChoice(filed, "draft-1", "docs");
    expect(settlePromotedDraft(chosen, "draft-1", "env:t1").folderIdByThreadKey).toEqual({
      "env:t1": "ci",
    });
  });

  it("groups threads by folder in folder order and keeps unfiled ones apart", () => {
    const state = moveThreadsToFolder(
      moveThreadsToFolder(withFolders, ["b", "d"], "docs"),
      ["c"],
      "ci",
    );
    const { unfiled, groups } = groupThreadsByFolder(
      ["a", "b", "c", "d", "e"],
      (key) => key,
      state.folders,
      state.folderIdByThreadKey,
    );
    expect(unfiled).toEqual(["a", "e"]);
    expect(groups.map((group) => [group.folder.id, group.threads])).toEqual([
      ["ci", ["c"]],
      ["docs", ["b", "d"]],
    ]);
  });

  it("toggles a folder group closed and open, and forgets it with the folder", () => {
    const closed = toggleFolderCollapsed(withFolders, "ci");
    expect(closed.collapsedFolderIds).toEqual(["ci"]);
    expect(toggleFolderCollapsed(closed, "ci").collapsedFolderIds).toEqual([]);
    expect(deleteFolder(closed, "ci").collapsedFolderIds).toEqual([]);
  });

  it("orders a folder's rows as the user dragged them, newcomers first", () => {
    const filed = moveThreadsToFolder(withFolders, ["a", "b", "c", "d"], "ci");
    const placed = setFolderThreadOrder(filed, "ci", ["c", "a", "b"]);
    const { groups } = groupThreadsByFolder(
      ["a", "b", "c", "d"],
      (key) => key,
      placed.folders,
      placed.folderIdByThreadKey,
      placed.threadOrderByFolder,
    );
    expect(groups[0]?.threads).toEqual(["d", "c", "a", "b"]);
    expect(setFolderThreadOrder(placed, "ci", ["c", "a", "b"])).toBe(placed);
    expect(deleteFolder(placed, "ci").threadOrderByFolder).toEqual({});
  });

  it("moves a row to the top, up, down or to the bottom of its folder", () => {
    const order = ["a", "b", "c", "d"];
    expect(moveInFolderOrder(order, "c", "top")).toEqual(["c", "a", "b", "d"]);
    expect(moveInFolderOrder(order, "c", "up")).toEqual(["a", "c", "b", "d"]);
    expect(moveInFolderOrder(order, "b", "down")).toEqual(["a", "c", "b", "d"]);
    expect(moveInFolderOrder(order, "b", "bottom")).toEqual(["a", "c", "d", "b"]);
    expect(moveInFolderOrder(order, "a", "up")).toBe(order);
    expect(moveInFolderOrder(order, "x", "down")).toBe(order);
  });
});
