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
  const assetUpload1 = "00000000-0000-0000-0000-000000000101";
  const assetFile1 = "00000000-0000-0000-0000-000000000102";
  const assetProcessing1 = "00000000-0000-0000-0000-000000000103";
  const assetOtherProject1 = "00000000-0000-0000-0000-000000000104";
  const assetContinuation1 = "00000000-0000-0000-0000-000000000105";
  const project1 = "00000000-0000-0000-0000-000000000201";
  const project2 = "00000000-0000-0000-0000-000000000202";

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
        id: assetUpload1,
        kind: "image",
        project_id: project1,
        status: "available",
      },
    ]);

    await expect(repository.validateImageReferences({
      projectId: project1,
      referenceContext: {
        items: [
          { assetId: assetUpload1, kind: "upload", label: "Upload 1", refId: "upload-1" },
        ],
      },
      tenantId: "tenant-1",
    })).resolves.toBeUndefined();

    expect(query).toHaveBeenCalledWith(expect.stringContaining("FROM assets"), ["tenant-1", [assetUpload1]]);
  });

  it("validates continuation asset ids together with current references", async () => {
    const { query, repository } = createRepository([
      {
        id: assetUpload1,
        kind: "image",
        project_id: project1,
        status: "available",
      },
      {
        id: assetContinuation1,
        kind: "image",
        project_id: project1,
        status: "available",
      },
    ]);

    await expect(repository.validateImageReferences({
      continuationContext: {
        action: "continue-edit",
        assetId: assetContinuation1,
        assetIds: [assetContinuation1, assetUpload1],
        assetLabel: "Continuation",
        assetRefId: "round-1-image-1",
      },
      projectId: project1,
      referenceContext: {
        items: [
          { assetId: assetUpload1, kind: "upload", label: "Upload 1", refId: "upload-1" },
        ],
      },
      tenantId: "tenant-1",
    })).resolves.toBeUndefined();

    expect(query).toHaveBeenCalledWith(expect.stringContaining("FROM assets"), ["tenant-1", [assetUpload1, assetContinuation1]]);
  });

  it("rejects malformed asset ids without querying the pool", async () => {
    const { query, repository } = createRepository([]);

    await expect(repository.validateImageReferences({
      referenceContext: {
        items: [
          { assetId: "asset-upload-1", kind: "upload", label: "Malformed", refId: "upload-1" },
        ],
      },
      tenantId: "tenant-1",
    })).rejects.toMatchObject({
      code: "AGENT_REFERENCE_INVALID_ASSET_ID",
      statusCode: 400,
    });

    expect(query).not.toHaveBeenCalled();
  });

  it("rejects malformed continuation asset ids without querying the pool", async () => {
    const { query, repository } = createRepository([]);

    await expect(repository.validateImageReferences({
      continuationContext: {
        action: "make-variant",
        assetId: "asset-continuation-1",
        assetLabel: "Continuation",
        assetRefId: "round-1-image-1",
      },
      tenantId: "tenant-1",
    })).rejects.toMatchObject({
      code: "AGENT_REFERENCE_INVALID_ASSET_ID",
      statusCode: 400,
    });

    expect(query).not.toHaveBeenCalled();
  });

  it("rejects non-image continuation assets", async () => {
    const { repository } = createRepository([
      {
        id: assetFile1,
        kind: "file",
        project_id: project1,
        status: "available",
      },
    ]);

    await expect(repository.validateImageReferences({
      continuationContext: {
        action: "continue-edit",
        assetId: assetFile1,
        assetLabel: "File",
        assetRefId: "round-1-image-1",
      },
      projectId: project1,
      tenantId: "tenant-1",
    })).rejects.toMatchObject({
      code: "AGENT_REFERENCE_INVALID_KIND",
      statusCode: 400,
    });
  });

  it("rejects unavailable continuation assets", async () => {
    const { repository } = createRepository([
      {
        id: assetProcessing1,
        kind: "image",
        project_id: project1,
        status: "processing",
      },
    ]);

    await expect(repository.validateImageReferences({
      continuationContext: {
        action: "continue-edit",
        assetId: assetProcessing1,
        assetLabel: "Processing",
        assetRefId: "round-1-image-1",
      },
      projectId: project1,
      tenantId: "tenant-1",
    })).rejects.toMatchObject({
      code: "AGENT_REFERENCE_UNAVAILABLE",
      statusCode: 400,
    });
  });

  it("rejects continuation assets tied to a different project", async () => {
    const { repository } = createRepository([
      {
        id: assetOtherProject1,
        kind: "image",
        project_id: project2,
        status: "available",
      },
    ]);

    await expect(repository.validateImageReferences({
      continuationContext: {
        action: "continue-edit",
        assetId: assetOtherProject1,
        assetLabel: "Other Project",
        assetRefId: "round-1-image-1",
      },
      projectId: project1,
      tenantId: "tenant-1",
    })).rejects.toMatchObject({
      code: "AGENT_REFERENCE_PROJECT_MISMATCH",
      statusCode: 400,
    });
  });

  it("rejects missing assets with a reference error", async () => {
    const { repository } = createRepository([]);

    await expect(repository.validateImageReferences({
      referenceContext: {
        items: [
          { assetId: "00000000-0000-0000-0000-000000000199", kind: "upload", label: "Missing", refId: "upload-1" },
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
        id: assetFile1,
        kind: "file",
        project_id: project1,
        status: "available",
      },
    ]);

    await expect(repository.validateImageReferences({
      projectId: project1,
      referenceContext: {
        items: [
          { assetId: assetFile1, kind: "upload", label: "File", refId: "upload-1" },
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
        id: assetProcessing1,
        kind: "image",
        project_id: project1,
        status: "processing",
      },
    ]);

    await expect(repository.validateImageReferences({
      projectId: project1,
      referenceContext: {
        items: [
          { assetId: assetProcessing1, kind: "upload", label: "Processing", refId: "upload-1" },
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
        id: assetOtherProject1,
        kind: "image",
        project_id: project2,
        status: "available",
      },
    ]);

    await expect(repository.validateImageReferences({
      projectId: project1,
      referenceContext: {
        items: [
          { assetId: assetOtherProject1, kind: "upload", label: "Other Project", refId: "upload-1" },
        ],
      },
      tenantId: "tenant-1",
    })).rejects.toMatchObject({
      code: "AGENT_REFERENCE_PROJECT_MISMATCH",
      statusCode: 400,
    });
  });
});
