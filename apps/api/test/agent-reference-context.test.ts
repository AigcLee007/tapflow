import { describe, expect, it } from "vitest";

import {
  AgentReferenceResolutionError,
  resolveAgentReferenceAssetIds,
} from "../src/modules/agent/agent-reference-context.js";

describe("agent reference context resolver", () => {
  it("resolves user-facing refIds to asset ids", () => {
    const resolved = resolveAgentReferenceAssetIds({
      referenceContext: {
        items: [
          { assetId: "asset-upload-1", kind: "upload", label: "Upload 1", refId: "upload-1" },
        ],
      },
      requestedRefs: ["upload-1"],
    });

    expect(resolved).toEqual(["asset-upload-1"]);
  });

  it("accepts an assetId only when in the allowed set", () => {
    expect(resolveAgentReferenceAssetIds({
      referenceContext: {
        items: [
          { assetId: "asset-upload-1", kind: "upload", label: "Upload 1", refId: "upload-1" },
        ],
      },
      requestedRefs: ["asset-upload-1"],
    })).toEqual(["asset-upload-1"]);

    expect(() => resolveAgentReferenceAssetIds({
      referenceContext: {
        items: [
          { assetId: "asset-upload-1", kind: "upload", label: "Upload 1", refId: "upload-1" },
        ],
      },
      requestedRefs: ["asset-stranger"],
    })).toThrow(AgentReferenceResolutionError);
  });

  it("falls back to continuation asset ids when no refs requested", () => {
    const resolved = resolveAgentReferenceAssetIds({
      continuationContext: {
        action: "continue-edit",
        assetId: "asset-primary",
        assetIds: ["asset-primary", "asset-secondary"],
        assetLabel: "Primary",
        assetRefId: "round-1-image-1",
        assetRefIds: ["round-1-image-1", "round-1-image-2"],
      },
    });

    expect(resolved).toEqual(["asset-primary", "asset-secondary"]);
  });

  it("includes previous successful session refs as known references", () => {
    const resolved = resolveAgentReferenceAssetIds({
      previousResults: [
        { assetId: "asset-previous", refId: "round-1-image-1" },
      ],
      requestedRefs: ["round-1-image-1"],
    });

    expect(resolved).toEqual(["asset-previous"]);
  });

  it("fails closed for unknown refs", () => {
    expect(() => resolveAgentReferenceAssetIds({
      requestedRefs: ["missing-ref"],
    })).toThrow(expect.objectContaining({
      code: "AGENT_REFERENCE_NOT_FOUND",
      statusCode: 400,
    }));
  });

  it("deduplicates output while preserving first occurrence order", () => {
    const resolved = resolveAgentReferenceAssetIds({
      continuationContext: {
        action: "make-variant",
        assetId: "asset-continuation",
        assetIds: ["asset-continuation", "asset-upload-1"],
        assetLabel: "Continuation",
        assetRefId: "round-1-image-1",
      },
      previousResults: [
        { assetId: "asset-previous", refId: "round-1-image-2" },
      ],
      referenceContext: {
        items: [
          { assetId: "asset-upload-1", kind: "upload", label: "Upload 1", refId: "upload-1" },
        ],
      },
      requestedRefs: ["upload-1", "round-1-image-2", "asset-upload-1", "asset-continuation"],
    });

    expect(resolved).toEqual(["asset-upload-1", "asset-previous", "asset-continuation"]);
  });
});
