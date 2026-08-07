import { describe, expect, it } from "vitest";
import type { FlowNodeData } from "../types";
import {
  buildCanvasInputSignature,
  resolveCanvasInputItems,
  toAssetInputKey,
  toUpstreamInputKey,
  type CanvasInputSeed,
} from "./canvasInputProjection";

const upstreamText: CanvasInputSeed = {
  inputKey: toUpstreamInputKey("text-node"),
  source: "upstream",
  kind: "text",
  title: "Script",
  edgeId: "edge-text",
  sourceNodeId: "text-node",
  textExcerpt: "Do not persist this excerpt",
  sourceRevision: "text-revision-1",
  previewState: "unavailable",
};

const upstreamImage: CanvasInputSeed = {
  inputKey: toUpstreamInputKey("image-node"),
  source: "upstream",
  kind: "image",
  title: "Reference image",
  edgeId: "edge-image",
  sourceNodeId: "image-node",
  assetId: "asset-image",
  previewUrl: "https://example.test/signed-image",
  previewState: "ready",
};

const directAsset: CanvasInputSeed = {
  inputKey: toAssetInputKey("asset-video"),
  source: "asset",
  kind: "video",
  title: "Direct asset",
  assetId: "asset-video",
  durationMs: 4_000,
  previewState: "unavailable",
};

describe("canvas input projection", () => {
  it("honors known input order and appends unique remaining mixed inputs", () => {
    const items = resolveCanvasInputItems({
      inputOrder: [directAsset.inputKey, upstreamText.inputKey, "stale", directAsset.inputKey],
      seeds: [upstreamImage, directAsset, upstreamText, upstreamImage],
    });

    expect(items.map((item) => item.inputKey)).toEqual([
      directAsset.inputKey,
      upstreamText.inputKey,
      upstreamImage.inputKey,
    ]);
    expect(items.map((item) => item.order)).toEqual([0, 1, 2]);
  });

  it("keeps previewless direct media inputs without upstream identifiers", () => {
    const [item] = resolveCanvasInputItems({ inputOrder: [], seeds: [directAsset] });

    expect(item).toMatchObject({
      inputKey: "asset:asset-video",
      source: "asset",
      kind: "video",
      assetId: "asset-video",
      previewState: "unavailable",
    });
    expect(item.edgeId).toBeUndefined();
    expect(item.sourceNodeId).toBeUndefined();
  });

  it("keeps volatile previews in runtime items but persists only stable input fields", () => {
    const [item] = resolveCanvasInputItems({ inputOrder: [], seeds: [upstreamImage] });
    const persistedInputFields: Pick<FlowNodeData, "inputOrder" | "lastGenerationInputSignature"> = {
      inputOrder: [item.inputKey],
      lastGenerationInputSignature: "input-v1:12345678",
    };

    expect(item.previewUrl).toBe("https://example.test/signed-image");
    expect(Object.keys(persistedInputFields)).toEqual([
      "inputOrder",
      "lastGenerationInputSignature",
    ]);
    expect(persistedInputFields).not.toHaveProperty("previewUrl");
    expect(persistedInputFields).not.toHaveProperty("textExcerpt");
  });

  it("makes a deterministic trim-insensitive safe signature", () => {
    const items = resolveCanvasInputItems({ inputOrder: [], seeds: [upstreamText, upstreamImage] });
    const signature = buildCanvasInputSignature({
      items,
      localPrompt: "  local prompt with private details  ",
      targetNodeId: "target-node",
    });

    expect(signature).toMatch(/^input-v1:[0-9a-f]{8}$/);
    expect(signature).toBe(buildCanvasInputSignature({
      items,
      localPrompt: "local prompt with private details",
      targetNodeId: "target-node",
    }));
    expect(signature).not.toContain("private");
    expect(signature).not.toContain("example.test");
    expect(signature).not.toContain("excerpt");
  });

  it("detects prompt and text revisions but ignores media revisions", () => {
    const items = resolveCanvasInputItems({ inputOrder: [], seeds: [upstreamText, upstreamImage] });
    const baseline = buildCanvasInputSignature({ items, localPrompt: "prompt one", targetNodeId: "target-node" });
    const changedPrompt = buildCanvasInputSignature({ items, localPrompt: "prompt two", targetNodeId: "target-node" });
    const changedText = buildCanvasInputSignature({
      items: resolveCanvasInputItems({
        inputOrder: [],
        seeds: [{ ...upstreamText, sourceRevision: "text-revision-2" }, upstreamImage],
      }),
      localPrompt: "prompt one",
      targetNodeId: "target-node",
    });
    const changedMedia = buildCanvasInputSignature({
      items: resolveCanvasInputItems({
        inputOrder: [],
        seeds: [upstreamText, { ...upstreamImage, sourceRevision: "preview-revision-2" }],
      }),
      localPrompt: "prompt one",
      targetNodeId: "target-node",
    });

    expect(changedPrompt).not.toBe(baseline);
    expect(changedText).not.toBe(baseline);
    expect(changedMedia).toBe(baseline);
  });

  it("detects explicit input order while raw seed arrays use their array order", () => {
    const baseItems = resolveCanvasInputItems({ inputOrder: [], seeds: [upstreamText, upstreamImage] });
    const explicitOrderChanged = [{ ...baseItems[0], order: 1 }, { ...baseItems[1], order: 0 }];
    const baseline = buildCanvasInputSignature({ items: baseItems, localPrompt: "prompt", targetNodeId: "target-node" });

    expect(buildCanvasInputSignature({
      items: explicitOrderChanged,
      localPrompt: "prompt",
      targetNodeId: "target-node",
    })).not.toBe(baseline);
    expect(buildCanvasInputSignature({
      items: [upstreamText, upstreamImage],
      localPrompt: "prompt",
      targetNodeId: "target-node",
    })).not.toBe(buildCanvasInputSignature({
      items: [upstreamImage, upstreamText],
      localPrompt: "prompt",
      targetNodeId: "target-node",
    }));
  });

  it("detects stable input identity fields but ignores volatile display fields", () => {
    const items = resolveCanvasInputItems({ inputOrder: [], seeds: [upstreamImage] });
    const baseline = buildCanvasInputSignature({ items, localPrompt: "prompt", targetNodeId: "target-node" });
    const signatureFor = (seed: CanvasInputSeed) => buildCanvasInputSignature({
      items: resolveCanvasInputItems({ inputOrder: [], seeds: [seed] }),
      localPrompt: "prompt",
      targetNodeId: "target-node",
    });

    expect(signatureFor({ ...upstreamImage, inputKey: "upstream:another-image" })).not.toBe(baseline);
    expect(signatureFor({ ...upstreamImage, assetId: "asset-image-2" })).not.toBe(baseline);
    expect(signatureFor({ ...upstreamImage, role: "first_frame" })).not.toBe(baseline);
    expect(signatureFor({
      ...upstreamImage,
      previewUrl: "https://example.test/refreshed-signed-image",
      textExcerpt: "Transient preview text",
    })).toBe(baseline);
  });
});
