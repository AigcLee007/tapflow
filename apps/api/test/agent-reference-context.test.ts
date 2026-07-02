import { describe, expect, it, vi } from "vitest";

import {
  AgentReferenceAssetRepository,
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

describe("AgentReferenceAssetRepository", () => {
  function createRepository(rows: Array<{
    id: string;
    kind: string;
    project_id: string | null;
    status: string;
  }>) {
    const query = vi.fn().mockResolvedValue({ rows });
    const pool = { query };
    return {
      query,
      repository: new AgentReferenceAssetRepository({ pool: pool as never }),
    };
  }

  it("accepts available image assets in the same tenant and project", async () => {
    const { query, repository } = createRepository([
      {
        id: "asset-upload-1",
        kind: "image",
        project_id: "project-1",
        status: "available",
      },
    ]);

    await expect(repository.validateImageReferences({
      projectId: "project-1",
      referenceContext: {
        items: [
          { assetId: "asset-upload-1", kind: "upload", label: "Upload 1", refId: "upload-1" },
        ],
      },
      tenantId: "tenant-1",
    })).resolves.toBeUndefined();

    expect(query).toHaveBeenCalledWith(expect.stringContaining("FROM assets"), ["tenant-1", ["asset-upload-1"]]);
  });

  it("rejects missing assets with a reference error", async () => {
    const { repository } = createRepository([]);

    await expect(repository.validateImageReferences({
      referenceContext: {
        items: [
          { assetId: "asset-missing", kind: "upload", label: "Missing", refId: "upload-1" },
        ],
      },
      tenantId: "tenant-1",
    })).rejects.toMatchObject({
      code: "AGENT_REFERENCE_NOT_FOUND",
      statusCode: 400,
    });
  });

  it("rejects non-image assets", async () => {
    const { repository } = createRepository([
      {
        id: "asset-file-1",
        kind: "file",
        project_id: "project-1",
        status: "available",
      },
    ]);

    await expect(repository.validateImageReferences({
      projectId: "project-1",
      referenceContext: {
        items: [
          { assetId: "asset-file-1", kind: "upload", label: "File", refId: "upload-1" },
        ],
      },
      tenantId: "tenant-1",
    })).rejects.toMatchObject({
      code: "AGENT_REFERENCE_INVALID_KIND",
      statusCode: 400,
    });
  });

  it("rejects unavailable assets", async () => {
    const { repository } = createRepository([
      {
        id: "asset-processing-1",
        kind: "image",
        project_id: "project-1",
        status: "processing",
      },
    ]);

    await expect(repository.validateImageReferences({
      projectId: "project-1",
      referenceContext: {
        items: [
          { assetId: "asset-processing-1", kind: "upload", label: "Processing", refId: "upload-1" },
        ],
      },
      tenantId: "tenant-1",
    })).rejects.toMatchObject({
      code: "AGENT_REFERENCE_UNAVAILABLE",
      statusCode: 400,
    });
  });

  it("rejects assets tied to a different project when a project id is supplied", async () => {
    const { repository } = createRepository([
      {
        id: "asset-other-project-1",
        kind: "image",
        project_id: "project-2",
        status: "available",
      },
    ]);

    await expect(repository.validateImageReferences({
      projectId: "project-1",
      referenceContext: {
        items: [
          { assetId: "asset-other-project-1", kind: "upload", label: "Other Project", refId: "upload-1" },
        ],
      },
      tenantId: "tenant-1",
    })).rejects.toMatchObject({
      code: "AGENT_REFERENCE_PROJECT_MISMATCH",
      statusCode: 400,
    });
  });
});
