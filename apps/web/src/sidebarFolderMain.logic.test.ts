import { describe, expect, it } from "vite-plus/test";

import {
  folderMemberStatus,
  formatFolderMainContext,
  splitFolderMainContext,
} from "./sidebarFolderMain.logic";

const shell = {
  settledOverride: null,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  source: { status: "rolled_back" },
} as const;

describe("folder main thread context", () => {
  it("lists the folder's threads and folds back out of the message", () => {
    const block = formatFolderMainContext('Beta "issues"', [
      { threadId: "t-1", title: 'Fix "cart"', status: "running" },
      { threadId: "t-2", title: "Docs", status: "settled" },
    ]);
    expect(block).toContain('<t3-folder-main folder="Beta \'issues\'" threads="2">');
    expect(block).toContain('- t-1 "Fix \\"cart\\"" (running)');
    expect(splitFolderMainContext(`Check the CI${block}`)).toEqual({
      text: "Check the CI",
      folder: { name: "Beta 'issues'", threadCount: 2 },
    });
    expect(formatFolderMainContext("Ops", [])).toContain("no other threads yet");
  });

  it("leaves messages without a trailing block alone", () => {
    const text = 'Quote <t3-folder-main folder="x" threads="1"></t3-folder-main> then more';
    expect(splitFolderMainContext(text)).toEqual({ text, folder: null });
  });

  it("describes a member's state", () => {
    expect(folderMemberStatus(shell)).toBe("rolled back");
    expect(folderMemberStatus({ ...shell, hasPendingUserInput: true })).toBe("waiting for input");
    expect(folderMemberStatus({ ...shell, hasPendingApprovals: true })).toBe(
      "waiting for approval",
    );
    expect(folderMemberStatus({ ...shell, settledOverride: "settled" })).toBe("settled");
  });
});
