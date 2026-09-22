import { describe, expect, it } from "vitest";

import {
  normalizeAgentContextSnapshot,
  normalizeConversationBlocks,
  type AgentContextSnapshot,
} from "./agentProtocol";

describe("canonical agent protocol", () => {
  const snapshot: AgentContextSnapshot = {
    projectId: "project-1",
    flowId: "flow-1",
    graphRevision: 7,
    refs: [
      {
        refId: "ref-subject",
        source: "asset",
        assetId: "asset-1",
        role: "subject",
        label: "商品正面图",
      },
    ],
    skillIds: ["skill-1"],
    appIds: ["app-1"],
    modelKey: "image-model",
  };

  it("normalizes a stable context snapshot and keeps only the canonical fields", () => {
    expect(normalizeAgentContextSnapshot({ ...snapshot })).toEqual(snapshot);
  });

  it.each([
    ["data URL", { ...snapshot, refs: [{ ...snapshot.refs[0], label: "data:image/png;base64,abc" }] }],
    ["blob URL", { ...snapshot, refs: [{ ...snapshot.refs[0], label: "blob:https://example.test/id" }] }],
    ["signed URL", { ...snapshot, refs: [{ ...snapshot.refs[0], label: "https://example.test/image.png?X-Amz-Signature=secret" }] }],
    ["provider field", { ...snapshot, provider: "openai" }],
    ["credential field", { ...snapshot, credential: "secret" }],
    ["authorization field", { ...snapshot, Authorization: "Bearer secret" }],
    ["unknown field", { ...snapshot, unexpected: true }],
  ])("rejects unsafe %s context data", (_name, value) => {
    expect(() => normalizeAgentContextSnapshot(value)).toThrowError("AGENT_CONTEXT_UNSAFE");
  });

  it("rejects a ref role outside the canonical role set", () => {
    expect(() => normalizeAgentContextSnapshot({
      ...snapshot,
      refs: [{ ...snapshot.refs[0], role: "background" as never }],
    })).toThrowError("AGENT_CONTEXT_UNSAFE");
  });

  it("normalizes blocks, caps the block list, questions, results, and text", () => {
    const blocks = normalizeConversationBlocks([
      {
        type: "question_set",
        questions: Array.from({ length: 6 }, (_, index) => ({
          id: `question-${index}`,
          prompt: `Question ${index}`,
          kind: "text",
        })),
      },
      {
        type: "result_group",
        results: Array.from({ length: 30 }, (_, index) => ({
          id: `result-${index}`,
          label: `Result ${index}`,
          assetId: `asset-${index}`,
        })),
      },
      ...Array.from({ length: 70 }, (_, index) => ({
        type: "understanding" as const,
        text: `${index}-${"x".repeat(4_100)}`,
      })),
    ]);

    expect(blocks).toHaveLength(64);
    expect(blocks[0]).toMatchObject({ type: "question_set" });
    expect((blocks[0] as { questions: unknown[] }).questions).toHaveLength(4);
    expect((blocks[1] as { results: unknown[] }).results).toHaveLength(24);
    expect((blocks[2] as { text: string }).text).toHaveLength(4_000);
  });

  it("rejects unknown or unsafe block fields", () => {
    expect(() => normalizeConversationBlocks([{ type: "understanding", text: "ok", provider: "secret" }])).toThrowError("AGENT_BLOCK_INVALID");
    expect(() => normalizeConversationBlocks([{ type: "understanding", text: "data:image/png;base64,abc" }])).toThrowError("AGENT_BLOCK_INVALID");
    expect(() => normalizeConversationBlocks([{ type: "not-a-block", text: "ok" }])).toThrowError("AGENT_BLOCK_INVALID");
  });
});
