import { describe, expect, it } from "vitest";
import { createPromptItems, createTaobaoSuitePlan, createVisualBible } from "../src/modules/agent/v4/taobao-suite-planner.js";

describe("淘宝套图 planner", () => {
  it("creates editable main/detail page counts and dependency graph", () => {
    const plan = createTaobaoSuitePlan({ mainImageCount: 3, detailPageCount: 2 });
    expect(plan.pages.map((p) => p.pageKey)).toEqual(["main-1", "main-2", "main-3", "detail-1", "detail-2"]);
    expect(plan.pages[0].dependsOn).toEqual([]);
    expect(plan.pages[1].dependsOn).toEqual(["base"]);
  });
  it("keeps a shared visual bible and self-contained prompts", () => {
    const plan = createTaobaoSuitePlan({ mainImageCount: 1, detailPageCount: 1 });
    const bible = createVisualBible("银色金属机身，黑色键帽");
    const items = createPromptItems(plan, bible, ["photo-1"]);
    expect(items).toHaveLength(2);
    expect(items[0].referenceAssetIds).toEqual(["photo-1"]);
    expect(items[1].prompt).toContain("不得改变商品结构");
  });
});
