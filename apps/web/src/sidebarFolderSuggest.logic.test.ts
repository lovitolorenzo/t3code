import { describe, expect, it } from "vite-plus/test";

import { suggestFolders, titleTokens } from "./sidebarFolderSuggest.logic";

const folders = [
  { id: "ci", name: "CI Optimization" },
  { id: "beta", name: "Beta issues" },
];
const threads = [
  { key: "t1", title: "Buildkite vs GitHub Actions Benchmark" },
  { key: "t2", title: "Cut CI Cost, Speed Up PR Checks" },
  { key: "t3", title: "Ubicloud premium vs AX102: pr-checks benchmark" },
  { key: "t4", title: "Lista issues beta" },
  { key: "t5", title: "Add Authorize remainder to Admin guide" },
  { key: "t6", title: "Revolut: staging Xero mapping rows" },
  { key: "t7", title: "Daily Report" },
  { key: "n1", title: "Cost of Blacksmith AX102 for dev push runners" },
  { key: "n2", title: "Restore CI typecheck gate in Buildkite" },
  { key: "n3", title: "Remaining beta issues for autopilot" },
  { key: "n4", title: "Revolut ledger mapping" },
];
const filed = { t1: "ci", t2: "ci", t3: "ci", t4: "beta" };

describe("folder suggestions", () => {
  it("drops stopwords, numbers and single letters but keeps short terms like CI", () => {
    expect([...titleTokens("Riduzione dei tempi della CI, step 2 e PR")]).toEqual([
      "riduzione",
      "tempi",
      "ci",
      "step",
      "pr",
    ]);
  });

  it("suggests the folder whose titles share the rarest words", () => {
    const suggestions = suggestFolders({
      folders,
      threads,
      folderIdByThreadKey: filed,
      candidateKeys: ["n1", "n2", "n3", "n4"],
      dismissedFolderIdByThreadKey: {},
    });
    expect(suggestions.get("n1")).toBe("ci");
    expect(suggestions.get("n2")).toBe("ci");
    expect(suggestions.get("n3")).toBe("beta");
    expect(suggestions.has("n4")).toBe(false);
  });

  it("skips filed threads and suggestions the user dismissed", () => {
    const suggestions = suggestFolders({
      folders,
      threads,
      folderIdByThreadKey: { ...filed, n1: "beta" },
      candidateKeys: ["n1", "n2"],
      dismissedFolderIdByThreadKey: { n2: "ci" },
    });
    expect(suggestions.size).toBe(0);
  });
});
