import type { WorkbenchDisplayMode, WorkbenchGenerationView, WorkbenchResultView } from "../services/v2WorkbenchApi";

export type WorkbenchOutputFormat = "jpeg" | "png" | "webp";
export type WorkbenchQuality = "auto" | "high" | "low" | "medium";
export type WorkbenchModeration = "auto" | "low";

export type WorkbenchDraft = {
  aspectRatio: string;
  displayMode: WorkbenchDisplayMode;
  modelId: string;
  moderation: WorkbenchModeration;
  outputFormat: WorkbenchOutputFormat;
  prompt: string;
  quality: WorkbenchQuality;
  quantity: number;
  referenceAssetIds: string[];
  routeKey: string;
  size: string;
};

export type WorkbenchGeneration = WorkbenchGenerationView;
export type WorkbenchResult = WorkbenchResultView;
