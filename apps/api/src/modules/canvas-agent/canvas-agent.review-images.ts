import type { AssetReferenceInput } from "@aigc-flow/ai-gateway-core";

import type { AssetsService } from "../assets/assets.service.js";
import type { CanvasAgentImageLoader } from "./canvas-agent.loop.js";
import type { CanvasAgentContext } from "./canvas-agent.types.js";

/** At most this many generated images are shown to the model per review. */
export const MAX_REVIEW_IMAGES = 4;
/** Skip anything larger: previews are small, originals can be many MB. */
export const MAX_REVIEW_IMAGE_BYTES = 3 * 1024 * 1024;

/**
 * Loads generated images for result review. Uses the "preview" variant (falls
 * back to the original) and provides both shapes the text adapters read:
 * `metadata.base64` (relay adapter) and `metadata.url` as a data URL (OpenAI).
 * Unreadable or oversized images are skipped so review never blocks the turn.
 */
export function createReviewImageLoader(assets: Pick<AssetsService, "getAssetBytes">): CanvasAgentImageLoader {
  return {
    async load(ctx: CanvasAgentContext, assetIds: string[]): Promise<AssetReferenceInput[]> {
      const loaded: AssetReferenceInput[] = [];
      for (const assetId of [...new Set(assetIds)].slice(0, MAX_REVIEW_IMAGES)) {
        try {
          const object = await assets.getAssetBytes({ tenantId: ctx.tenantId, userId: ctx.userId }, assetId, "preview");
          const mimeType = object.contentType.split(";")[0]!.trim().toLowerCase();
          if (!mimeType.startsWith("image/") || object.body.byteLength > MAX_REVIEW_IMAGE_BYTES) continue;
          const base64 = object.body.toString("base64");
          loaded.push({ assetId, kind: "image", metadata: { base64, url: `data:${mimeType};base64,${base64}` }, mimeType });
        } catch {
          // Missing or unreadable asset: review the rest.
        }
      }
      return loaded;
    },
  };
}
