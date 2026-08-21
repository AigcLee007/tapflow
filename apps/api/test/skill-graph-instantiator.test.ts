import { describe, expect, it } from "vitest";
import { instantiateSkillGraphTemplate } from "../src/modules/agent/skill-graph-instantiator.js";

describe("skill graph instantiator", () => {
  it("remaps ids and applies declared inputs without retaining template ids", () => {
    const graph = instantiateSkillGraphTemplate({ schemaVersion: "v2", nodes: [{ id: "prompt", type: "text", data: { title: "Prompt" } }, { id: "image", type: "image" }], edges: [{ source: "prompt", target: "image" }], inputBindings: { prompt: { kind: "text", target: "prompt", path: "data.body" } } }, { prompt: "A cat" }, () => `fresh-${Math.random()}`);
    expect(graph.nodes.map((node) => node.id)).not.toContain("prompt");
    expect(graph.nodes.find((node) => node.type === "text")?.data?.body).toBe("A cat");
    expect(graph.edges[0]?.source).toBe(graph.nodes.find((node) => node.type === "text")?.id);
  });
});
