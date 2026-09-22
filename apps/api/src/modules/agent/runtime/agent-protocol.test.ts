import { describe, expect, it } from "vitest";

import {
  agentContextSnapshotSchema,
  normalizeAgentContextSnapshot,
  normalizeConversationBlocks,
} from "./agent-protocol.js";

describe("server canonical agent protocol", () => {
  const snapshot = {
    projectId: "project-1",
    flowId: "flow-1",
    graphRevision: 7,
    refs: [{ refId: "ref-1", source: "asset", assetId: "asset-1", role: "subject", label: "Subject" }],
    skillIds: ["skill-1"],
    appIds: ["app-1"],
    modelKey: "image-model",
  } as const;

  it("accepts and normalizes the stable context schema", () => {
    expect(agentContextSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(normalizeAgentContextSnapshot(snapshot)).toEqual(snapshot);
  });

  it("rejects unsafe context values with the canonical error code", () => {
    expect(() => normalizeAgentContextSnapshot({ ...snapshot, Authorization: "Bearer secret" })).toThrowError("AGENT_CONTEXT_UNSAFE");
    expect(() => normalizeAgentContextSnapshot({
      ...snapshot,
      refs: [{ ...snapshot.refs[0], label: "https://example.test/a.png?X-Amz-Signature=secret" }],
    })).toThrowError("AGENT_CONTEXT_UNSAFE");
    expect(() => normalizeAgentContextSnapshot({
      ...snapshot,
      refs: [{ ...snapshot.refs[0], role: "background" }],
    })).toThrowError("AGENT_CONTEXT_UNSAFE");
  });

  it("normalizes and bounds canonical conversation blocks", () => {
    const blocks = normalizeConversationBlocks([
      { type: "question_set", questions: Array.from({ length: 5 }, (_, index) => ({ id: `q-${index}`, prompt: `Q${index}`, kind: "text" })) },
      { type: "result_group", results: Array.from({ length: 25 }, (_, index) => ({ id: `r-${index}`, label: `R${index}`, assetId: `asset-${index}` })) },
    ]);
    expect(blocks[0]?.type).toBe("question_set");
    expect((blocks[0] as { questions: unknown[] }).questions).toHaveLength(4);
    expect((blocks[1] as { results: unknown[] }).results).toHaveLength(24);
  });

  it("caps long block text before validating the wire shape", () => {
    const [block] = normalizeConversationBlocks([{ type: "understanding", text: "x".repeat(4_500) }]);
    expect(block).toMatchObject({ type: "understanding", text: "x".repeat(4_000) });
  });

  it("rejects unknown block fields and sensitive payloads", () => {
    expect(() => normalizeConversationBlocks([{ type: "plan", provider: "openai" }])).toThrowError("AGENT_BLOCK_INVALID");
    expect(() => normalizeConversationBlocks([{ type: "plan", summary: "blob:https://example.test/x" }])).toThrowError("AGENT_BLOCK_INVALID");
  });
});
