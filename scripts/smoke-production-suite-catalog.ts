import { pathToFileURL } from "node:url";

export const REQUIRED_PRODUCTION_IMAGE_MODES = [
  "standard",
  "panorama_360",
  "wraparound_270",
  "subject_orbit_270",
] as const;

const REQUIRED_VIDEO_EDITOR_WORKFLOW = "video_editor_export";
const DEFAULT_IMAGE_MODEL_KEY = "gpt-image-2";
const DEFAULT_VIDEO_MODEL_KEY = "video-editor-ffmpeg";
const DEFAULT_VIDEO_EDITOR_ROUTE_KEY = "video.editor.ffmpeg";

type CatalogRoute = {
  capabilities?: {
    supportedGenerationModes?: string[];
    supportedVideoWorkflows?: string[];
  };
  estimatedCredits: number | null;
  minChargeCredits: number | null;
  pricingUnit: string | null;
  routeKey: string;
};

export type ProductionSuiteCatalogReport = {
  imageProductionRouteKeys: string[];
  imageRequiredModes: string[];
  status: "ok";
  videoEditorExportRouteKey: string;
};

type SmokeConfig = {
  accessToken: string;
  apiUrl: string;
  imageModelKey: string;
  videoModelKey: string;
};

function hasPositiveCredits(route: Pick<CatalogRoute, "estimatedCredits" | "minChargeCredits">): boolean {
  return (
    (typeof route.estimatedCredits === "number" && Number.isFinite(route.estimatedCredits) && route.estimatedCredits > 0) ||
    (typeof route.minChargeCredits === "number" && Number.isFinite(route.minChargeCredits) && route.minChargeCredits > 0)
  );
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function routeSupportsAllProductionImageModes(route: CatalogRoute): boolean {
  const supportedModes = readStringList(route.capabilities?.supportedGenerationModes);
  return REQUIRED_PRODUCTION_IMAGE_MODES.every((mode) => supportedModes.includes(mode));
}

function routeSupportsVideoEditorExport(route: CatalogRoute): boolean {
  return readStringList(route.capabilities?.supportedVideoWorkflows).includes(REQUIRED_VIDEO_EDITOR_WORKFLOW);
}

export function validateProductionSuiteCatalog(input: {
  imageRoutes: CatalogRoute[];
  videoRoutes: CatalogRoute[];
}): ProductionSuiteCatalogReport {
  const imageProductionRoutes = input.imageRoutes.filter((route) =>
    route.pricingUnit === "image_generation" &&
    routeSupportsAllProductionImageModes(route) &&
    hasPositiveCredits(route),
  );
  const videoEditorRoute = input.videoRoutes.find((route) =>
    route.routeKey === DEFAULT_VIDEO_EDITOR_ROUTE_KEY &&
    route.pricingUnit === "video_generation" &&
    routeSupportsVideoEditorExport(route) &&
    hasPositiveCredits(route),
  );

  const failures: string[] = [];
  if (imageProductionRoutes.length === 0) {
    failures.push(
      `PRODUCTION_IMAGE_ROUTE_NOT_READY: no priced image route exposes ${REQUIRED_PRODUCTION_IMAGE_MODES.join(", ")}`,
    );
  }
  if (!videoEditorRoute) {
    failures.push(
      `VIDEO_EDITOR_FFMPEG_ROUTE_NOT_READY: ${DEFAULT_VIDEO_EDITOR_ROUTE_KEY} must expose ${REQUIRED_VIDEO_EDITOR_WORKFLOW} with video_generation pricing`,
    );
  }
  if (failures.length > 0) {
    throw new Error(failures.join("; "));
  }

  return {
    imageProductionRouteKeys: imageProductionRoutes.map((route) => route.routeKey),
    imageRequiredModes: [...REQUIRED_PRODUCTION_IMAGE_MODES],
    status: "ok",
    videoEditorExportRouteKey: videoEditorRoute.routeKey,
  };
}

function readConfig(argv: string[]): SmokeConfig {
  const config: SmokeConfig = {
    accessToken: process.env.TAPFLOW_ACCESS_TOKEN?.trim() || "",
    apiUrl: (process.env.TAPFLOW_API_URL?.trim() || process.env.TAPFLOW_API_BASE_URL?.trim() || "http://localhost:3366").replace(/\/$/, ""),
    imageModelKey: DEFAULT_IMAGE_MODEL_KEY,
    videoModelKey: DEFAULT_VIDEO_MODEL_KEY,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--api-url" || arg === "--api-base-url") {
      config.apiUrl = String(next || config.apiUrl).replace(/\/$/, "");
      index += 1;
    } else if (arg === "--token") {
      config.accessToken = String(next || "");
      index += 1;
    } else if (arg === "--image-model-key") {
      config.imageModelKey = String(next || DEFAULT_IMAGE_MODEL_KEY);
      index += 1;
    } else if (arg === "--video-model-key") {
      config.videoModelKey = String(next || DEFAULT_VIDEO_MODEL_KEY);
      index += 1;
    }
  }

  if (!config.accessToken) {
    throw new Error("Missing required env: TAPFLOW_ACCESS_TOKEN");
  }
  return config;
}

async function requestJson<T>(config: SmokeConfig, path: string): Promise<T> {
  const response = await fetch(`${config.apiUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    method: "GET",
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = body && typeof body === "object" && "message" in body
      ? String((body as { message?: unknown }).message)
      : `HTTP ${response.status}`;
    throw new Error(`${path} failed: ${message}`);
  }
  return body as T;
}

async function main(): Promise<void> {
  const config = readConfig(process.argv.slice(2));
  const [imageRoutes, videoRoutes] = await Promise.all([
    requestJson<CatalogRoute[]>(config, `/api/v2/ai/model-catalog/${encodeURIComponent(config.imageModelKey)}/routes`),
    requestJson<CatalogRoute[]>(config, `/api/v2/ai/model-catalog/${encodeURIComponent(config.videoModelKey)}/routes`),
  ]);
  const report = validateProductionSuiteCatalog({ imageRoutes, videoRoutes });
  console.log(JSON.stringify({
    ...report,
    apiUrl: config.apiUrl,
    imageModelKey: config.imageModelKey,
    videoModelKey: config.videoModelKey,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
