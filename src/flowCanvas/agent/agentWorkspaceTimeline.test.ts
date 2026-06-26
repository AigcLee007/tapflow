import { describe, expect, it } from "vitest";

import { buildAgentWorkspaceTimeline } from "./agentWorkspaceTimeline";

describe("buildAgentWorkspaceTimeline", () => {
  it("combines user messages, status events, tool cards, and result cards in one timeline", () => {
    const timeline = buildAgentWorkspaceTimeline({
      activityItems: [
        { id: "status-1", label: "Understanding request", state: "active", detail: "Reading canvas context." },
      ],
      error: null,
      messages: [{ id: "user-1", role: "user", content: "生成一张动物运动会海报" }],
      toolItems: [
        {
          assetRefs: [],
          estimate: {
            imageRunSettings: [],
          },
          status: "awaiting_approval",
          title: "Image generation",
          toolCallKey: "tool-1",
          toolName: "generate_image",
        },
      ],
    });

    expect(timeline.map((item) => item.kind)).toEqual(["message", "status", "tool"]);
    expect(timeline[0]).toMatchObject({ kind: "message", role: "user" });
    expect(timeline[1]).toMatchObject({ kind: "status", title: "正在理解需求" });
    expect(timeline[2]).toMatchObject({ kind: "tool", toolCallKey: "tool-1" });
  });

  it("converts successful tool assets into a result item", () => {
    const timeline = buildAgentWorkspaceTimeline({
      activityItems: [],
      error: null,
      messages: [],
      toolItems: [
        {
          activeAssetRefId: "ref-1",
          assetRefs: [{ assetId: "asset-1", kind: "image", label: "结果 1", promptSummary: "", refId: "ref-1" }],
          placedNodeIds: ["node-1"],
          status: "succeeded",
          title: "Image generation",
          toolCallKey: "tool-1",
          toolName: "generate_image",
        },
      ],
    });

    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      assets: [{ assetId: "asset-1", label: "结果 1", refId: "ref-1" }],
      kind: "result",
      placedNodeIds: ["node-1"],
    });
  });

  it("does not expose raw internal event names in status titles", () => {
    const timeline = buildAgentWorkspaceTimeline({
      activityItems: [{ id: "raw", label: "workflow_run_linked", state: "active", detail: "workflow_run_linked" }],
      error: null,
      messages: [],
      toolItems: [],
    });

    expect(JSON.stringify(timeline)).not.toContain("workflow_run_linked");
    expect(timeline[0]).toMatchObject({ kind: "status", title: "正在等待模型返回结果" });
  });
});
