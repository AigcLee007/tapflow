import { describe, expect, test } from "vitest";

import {
  REQUIRED_PRODUCTION_IMAGE_MODES,
  validateProductionSuiteCatalog,
} from "./smoke-production-suite-catalog";

describe("production suite catalog smoke helpers", () => {
  test("accepts priced image production routes and the ffmpeg video editor export route", () => {
    const report = validateProductionSuiteCatalog({
      imageRoutes: [
        {
          capabilities: {
            supportedGenerationModes: [...REQUIRED_PRODUCTION_IMAGE_MODES],
          },
          estimatedCredits: 24,
          minChargeCredits: 24,
          pricingUnit: "image_generation",
          routeKey: "image.gpt-image-2",
        },
      ],
      videoRoutes: [
        {
          capabilities: {
            supportedVideoWorkflows: ["video_editor_export"],
          },
          estimatedCredits: 50,
          minChargeCredits: 50,
          pricingUnit: "video_generation",
          routeKey: "video.editor.ffmpeg",
        },
      ],
    });

    expect(report).toMatchObject({
      imageProductionRouteKeys: ["image.gpt-image-2"],
      status: "ok",
      videoEditorExportRouteKey: "video.editor.ffmpeg",
    });
  });

  test("fails closed when production image routes or ffmpeg pricing are missing", () => {
    expect(() => validateProductionSuiteCatalog({
      imageRoutes: [
        {
          capabilities: { supportedGenerationModes: ["standard", "panorama_360"] },
          estimatedCredits: 24,
          minChargeCredits: 24,
          pricingUnit: "image_generation",
          routeKey: "image.partial",
        },
      ],
      videoRoutes: [
        {
          capabilities: { supportedVideoWorkflows: ["video_editor_export"] },
          estimatedCredits: null,
          minChargeCredits: null,
          pricingUnit: "video_generation",
          routeKey: "video.editor.ffmpeg",
        },
      ],
    })).toThrow(/PRODUCTION_IMAGE_ROUTE_NOT_READY|VIDEO_EDITOR_FFMPEG_ROUTE_NOT_READY/);
  });
});
