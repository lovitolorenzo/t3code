import { describe, expect, it } from "vite-plus/test";

import {
  applyFolderDirective,
  folderDirectiveHash,
  folderDirectiveThreadKeys,
  parseFolderDirective,
} from "./sidebarFolderDirective.logic";
import { EMPTY_SIDEBAR_FOLDER_STATE, createFolder } from "./sidebarFolders.logic";

const ENV = "3cfd6f8c-e873-4189-8fa1-687194cca3d4";
const OTHER_ENV = "9e05808e-d173-4498-bac0-0e21f1399be1";

describe("parseFolderDirective", () => {
  it("reads a folder name and thread ids, links included", () => {
    expect(
      parseFolderDirective(
        JSON.stringify({ folder: " Beta  issues ", threads: ["t1", "t3-thread://v1/t2", "t1"] }),
      ),
    ).toEqual({ folder: "Beta issues", threads: ["t1", "t2"] });
  });

  it("files the main thread with the others", () => {
    expect(parseFolderDirective('{"folder":"Beta","threads":["t1"],"main":"t2"}')).toEqual({
      folder: "Beta",
      threads: ["t1", "t2"],
      main: "t2",
    });
  });

  it("takes a null folder as leaving the folders", () => {
    expect(parseFolderDirective('{"folder":null,"threads":["t1"]}')).toEqual({
      folder: null,
      threads: ["t1"],
    });
  });

  it.each([
    ["unfinished JSON", '{"folder":"Beta","threads":["t1"'],
    ["no folder key", '{"threads":["t1"]}'],
    ["a blank folder", '{"folder":"  ","threads":["t1"]}'],
    ["no threads", '{"folder":"Beta","threads":[]}'],
    ["a thread that is not a string", '{"folder":"Beta","threads":[1]}'],
    ["an array", '["Beta"]'],
    ["a main thread without a folder", '{"folder":null,"threads":["t1"],"main":"t1"}'],
    ["a blank main thread", '{"folder":"Beta","threads":["t1"],"main":" "}'],
  ])("rejects %s", (_label, code) => {
    expect(parseFolderDirective(code)).toBeNull();
  });
});

describe("applyFolderDirective", () => {
  const state = createFolder(EMPTY_SIDEBAR_FOLDER_STATE, { id: "beta", name: "Beta issues" });

  it("scopes bare ids to the message's environment and keeps scoped keys", () => {
    expect(
      folderDirectiveThreadKeys({ folder: "Beta", threads: ["mcp:abc", `${OTHER_ENV}:t9`] }, ENV),
    ).toEqual([`${ENV}:mcp:abc`, `${OTHER_ENV}:t9`]);
  });

  it("files threads in the folder with that name, whatever its case", () => {
    const next = applyFolderDirective(
      state,
      { folder: "beta ISSUES", threads: ["t1", "t2"] },
      { environmentId: ENV, newFolderId: "unused" },
    );
    expect(next.folders).toHaveLength(1);
    expect(next.folderIdByThreadKey).toEqual({ [`${ENV}:t1`]: "beta", [`${ENV}:t2`]: "beta" });
  });

  it("creates a missing folder, then files the threads in it", () => {
    const next = applyFolderDirective(
      state,
      { folder: "CI", threads: ["t1"] },
      { environmentId: ENV, newFolderId: "ci" },
    );
    expect(next.folders.map((folder) => folder.name)).toEqual(["Beta issues", "CI"]);
    expect(next.folderIdByThreadKey).toEqual({ [`${ENV}:t1`]: "ci" });
  });

  it("makes the named thread the folder's main thread", () => {
    const next = applyFolderDirective(
      state,
      { folder: "CI", threads: ["t1", "t2"], main: "t2" },
      { environmentId: ENV, newFolderId: "ci" },
    );
    expect(next.mainThreadKeyByFolder).toEqual({ ci: `${ENV}:t2` });
  });

  it("takes threads out of their folders for a null folder", () => {
    const filed = applyFolderDirective(
      state,
      { folder: "Beta issues", threads: ["t1", "t2"] },
      { environmentId: ENV, newFolderId: "unused" },
    );
    const next = applyFolderDirective(
      filed,
      { folder: null, threads: ["t1"] },
      { environmentId: ENV, newFolderId: "unused" },
    );
    expect(next.folderIdByThreadKey).toEqual({ [`${ENV}:t2`]: "beta" });
  });
});

describe("folderDirectiveHash", () => {
  it("is stable and tells blocks apart", () => {
    expect(folderDirectiveHash("a")).toBe(folderDirectiveHash("a"));
    expect(folderDirectiveHash("a")).not.toBe(folderDirectiveHash("b"));
    expect(folderDirectiveHash("a")).toMatch(/^[0-9a-f]{8}$/);
  });
});
