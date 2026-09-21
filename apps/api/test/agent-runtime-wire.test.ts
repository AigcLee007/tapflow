import { describe, expect, it } from "vitest";
import { normalizeConversationBlocks as server } from "../src/modules/agent/runtime/agent-protocol.js";
import { normalizeConversationBlocks as client } from "../../../src/flowCanvas/agent/runtime/agentProtocol.js";
describe("canonical live and history wire compatibility", () => {
  it("preserves text results and placement identity on both ends", () => {
    const blocks = [{ type: "result_group", id: "group", results: [{ id: "result", label: "视频提示词", kind: "text", contentText: "机器人缓慢伸手，镜头平稳推进。", placedNodeId: "node", status: "ready" }] }];
    expect(client(server(blocks))).toEqual(blocks);
  });
  it("rejects overlong stable IDs on both ends instead of changing their identity", () => {
    for (const normalize of [client, server]) expect(() => normalize([{ type: "understanding", id: "i".repeat(220), text: "ok" }])).toThrow();
  });
  it("bounds recursive unknown input before stack overflow", () => {
    let payload: unknown = {};
    for (let i = 0; i < 30; i++) payload = { nested: payload };
    for (const normalize of [client, server]) expect(() => normalize([{ type: "understanding", text: "ok", payload }])).toThrow("AGENT_BLOCK_INVALID");
  });
});
