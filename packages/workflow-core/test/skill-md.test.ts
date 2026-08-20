import { describe, expect, it } from "vitest";

import {
  SkillPackageValidationError,
  parseSkillMarkdown,
  serializeSkillMarkdown,
  validateSkillGraphTemplate,
} from "../src/skill-md.js";

describe("SKILL.md package protocol", () => {
  it("parses and serializes public frontmatter without losing the method", () => {
    const parsed = parseSkillMarkdown(`---
name: Product copy
description: Write concise product copy
modality: text
category: ecommerce
triggers:
  - 商品文案
inputs:
  - product facts
outputs:
  - headline
approval_policy: credit_required
compatible_graph_schema: v2
---

## Method

Write three headline options and one call to action.
`);

    expect(parsed.frontmatter).toMatchObject({
      name: "Product copy",
      description: "Write concise product copy",
      modality: "text",
      category: "ecommerce",
      triggers: ["商品文案"],
      inputs: ["product facts"],
      outputs: ["headline"],
      approval_policy: "credit_required",
      compatible_graph_schema: "v2",
    });
    expect(parsed.body).toContain("Write three headline options");

    const roundTrip = serializeSkillMarkdown(parsed.frontmatter, parsed.body);
    expect(parseSkillMarkdown(roundTrip)).toEqual(parsed);
  });

  it("rejects executable and provider fields in a graph template", () => {
    expect(() => validateSkillGraphTemplate({
      nodes: [{ id: "image-1", type: "image", data: { routeKey: "secret.route" } }],
      edges: [],
    })).toThrow(SkillPackageValidationError);
    expect(() => validateSkillGraphTemplate({
      schemaVersion: "v2",
      nodes: [{ id: "script-1", type: "script", data: {} }],
      edges: [],
    })).toThrow(/node type/i);
  });

  it("allows only declared serializable template bindings", () => {
    const graph = validateSkillGraphTemplate({
      schemaVersion: "v2",
      nodes: [{ id: "text-1", type: "text", data: { body: "{{topic}}" } }],
      edges: [],
      inputBindings: { topic: { kind: "text", target: "text-1", path: "data.body" } },
    });

    expect(graph.nodes).toHaveLength(1);
    expect(graph.inputBindings?.topic.target).toBe("text-1");
  });
});
