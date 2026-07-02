import { describe, expect, it } from "vitest";

import {
  AGENT_REFERENCE_LIMIT,
  buildAgentReferenceContext,
} from "./agentReferenceContext";

describe("buildAgentReferenceContext", () => {
  it("filters chips missing assetId or refId", () => {
    const context = buildAgentReferenceContext({
      chips: [
        {
          id: "missing-asset",
          kind: "upload",
          label: "Missing asset",
          refId: "ref-missing-asset",
        },
        {
          assetId: "asset-missing-ref",
          id: "missing-ref",
          kind: "upload",
          label: "Missing ref",
        },
        {
          assetId: "asset-1",
          id: "valid",
          kind: "upload",
          label: "Valid",
          refId: "ref-1",
        },
      ],
    });

    expect(context.items).toEqual([
      {
        assetId: "asset-1",
        kind: "upload",
        label: "Valid",
        refId: "ref-1",
      },
    ]);
  });

  it("deduplicates items by refId", () => {
    const context = buildAgentReferenceContext({
      chips: [
        {
          assetId: "asset-1",
          id: "first",
          kind: "upload",
          label: "First",
          refId: "ref-1",
        },
        {
          assetId: "asset-2",
          id: "duplicate",
          kind: "canvas_node",
          label: "Duplicate",
          refId: "ref-1",
        },
      ],
      continuationContext: {
        action: "continue-edit",
        assetId: "asset-3",
        assetLabel: "Continuation",
        assetRefId: "ref-1",
      },
    });

    expect(context.items).toEqual([
      {
        assetId: "asset-1",
        kind: "upload",
        label: "First",
        refId: "ref-1",
      },
    ]);
  });

  it("caps items to AGENT_REFERENCE_LIMIT", () => {
    const context = buildAgentReferenceContext({
      chips: Array.from({ length: AGENT_REFERENCE_LIMIT + 2 }, (_, index) => ({
        assetId: `asset-${index + 1}`,
        id: `chip-${index + 1}`,
        kind: "upload" as const,
        label: `Reference ${index + 1}`,
        refId: `ref-${index + 1}`,
      })),
    });

    expect(context.items).toHaveLength(AGENT_REFERENCE_LIMIT);
    expect(context.items.map((item) => item.refId)).toEqual([
      "ref-1",
      "ref-2",
      "ref-3",
      "ref-4",
      "ref-5",
      "ref-6",
      "ref-7",
      "ref-8",
    ]);
  });

  it("adds continuation refs from plural arrays", () => {
    const context = buildAgentReferenceContext({
      chips: [],
      continuationContext: {
        action: "make-variant",
        assetId: "fallback-asset",
        assetIds: ["asset-1", "asset-2"],
        assetLabel: "Fallback label",
        assetLabels: ["Result 1", "Result 2"],
        assetRefId: "fallback-ref",
        assetRefIds: ["ref-1", "ref-2"],
      },
    });

    expect(context.items).toEqual([
      {
        assetId: "asset-1",
        kind: "artifact",
        label: "Result 1",
        refId: "ref-1",
      },
      {
        assetId: "asset-2",
        kind: "artifact",
        label: "Result 2",
        refId: "ref-2",
      },
    ]);
  });

  it("falls back to singular continuation fields", () => {
    const context = buildAgentReferenceContext({
      chips: [],
      continuationContext: {
        action: "make-poster",
        assetId: "asset-1",
        assetLabel: "Result",
        assetRefId: "ref-1",
      },
    });

    expect(context.items).toEqual([
      {
        assetId: "asset-1",
        kind: "artifact",
        label: "Result",
        refId: "ref-1",
      },
    ]);
  });

  it("does not include previewUrl in returned context", () => {
    const context = buildAgentReferenceContext({
      chips: [
        {
          assetId: "asset-1",
          id: "chip-1",
          kind: "canvas_node",
          label: "Reference",
          nodeId: "node-1",
          previewUrl: "blob:http://localhost/preview",
          refId: "ref-1",
        },
      ],
    });

    expect(context.items).toEqual([
      {
        assetId: "asset-1",
        kind: "canvas_node",
        label: "Reference",
        nodeId: "node-1",
        refId: "ref-1",
      },
    ]);
    expect(JSON.stringify(context)).not.toContain("previewUrl");
  });
});
