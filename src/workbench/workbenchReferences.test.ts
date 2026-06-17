import { describe, expect, test } from "vitest";

import {
  getReferencedAssetIdsForPrompt,
  insertWorkbenchReferenceMention,
  parseWorkbenchReferenceIndices,
} from "./workbenchReferences";

describe("workbenchReferences", () => {
  test("keeps all reference assets when the prompt has no valid reference tags", () => {
    expect(getReferencedAssetIdsForPrompt("生成一张海报", ["asset-1", "asset-2"])).toEqual(["asset-1", "asset-2"]);
    expect(getReferencedAssetIdsForPrompt("使用 @图9 的风格", ["asset-1", "asset-2"])).toEqual(["asset-1", "asset-2"]);
  });

  test("filters reference assets by @图N tags in stable order", () => {
    expect(getReferencedAssetIdsForPrompt("参考 @图2 和 @图1，忽略重复 @图2", [
      "asset-1",
      "asset-2",
      "asset-3",
    ])).toEqual(["asset-2", "asset-1"]);
  });

  test("parses @1 and @图1 reference tags", () => {
    expect(parseWorkbenchReferenceIndices("@1 @图2 @图8", 3)).toEqual([1, 2]);
  });

  test("inserts @图N mention at the caret", () => {
    expect(insertWorkbenchReferenceMention("城市夜景", 2, 2).prompt).toBe("城市 @图2 夜景");
  });
});
