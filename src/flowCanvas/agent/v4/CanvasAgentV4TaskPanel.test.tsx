import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CanvasAgentV4TaskPanel } from "./CanvasAgentV4TaskPanel";

describe("CanvasAgentV4TaskPanel", () => {
  it("shows suite plan, visual bible, prompt set and dependency graph", () => {
    render(<CanvasAgentV4TaskPanel task={{
      id: "task-1", status: "preview_ready", lastSequence: 4,
      events: [{ sequence: 1, type: "suite.plan", suitePlan: { mainImageCount: 2, detailPageCount: 1, pages: [{ pageKey: "main-1", purpose: "首图", dependsOn: [] }, { pageKey: "main-2", purpose: "卖点", dependsOn: ["base"] }, { pageKey: "detail-1", purpose: "参数", dependsOn: ["base"] }] } }, { sequence: 2, type: "visual_bible.create", visualBible: { productLock: "锁定外形", composition: "主体优先", lighting: "柔光", background: "中性", palette: ["白"], typography: "清晰", prohibitions: ["不改款"] } }, { sequence: 3, type: "prompt_set.create", promptSet: [{ itemId: "main-1", prompt: "首图提示词", referenceAssetIds: ["asset-1"] }] }, { sequence: 4, type: "dependency.graph", dependencyGraph: [{ from: "base", to: "main-2" }] }],
      generationItems: [],
    }} />);
    expect(screen.getByText(/主图 2 · 详情页 1/)).toBeTruthy();
    expect(screen.getByText("锁定外形")).toBeTruthy();
    expect(screen.getByText("首图提示词")).toBeTruthy();
    expect(screen.getByText("base → main-2")).toBeTruthy();
  });
});
