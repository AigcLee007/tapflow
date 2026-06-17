import type { V2WorkflowRunStatus } from "../../services/v2WorkflowRunsApi";
import type { FlowImageResultItem } from "../types";

export type WorkbenchProjectMode = "canvas" | "workbench";

export type WorkbenchOutputFormat = "jpeg" | "png" | "webp";
export type WorkbenchQuality = "auto" | "high" | "low" | "medium";
export type WorkbenchModeration = "auto" | "low";

export type WorkbenchBatchStatus =
  | V2WorkflowRunStatus
  | "idle"
  | "pending"
  | "running"
  | "success"
  | "error";

export type ImageWorkbenchDraft = {
  aspectRatio: string;
  batchCount: number;
  modelId: string;
  moderation: WorkbenchModeration;
  outputFormat: WorkbenchOutputFormat;
  prompt: string;
  quality: WorkbenchQuality;
  referenceAssetItemIds: string[];
  routeKey: string;
  size: string;
};

export type ImageWorkbenchBatch = {
  aspectRatio: string;
  batchCount: number;
  batchId: string;
  createdAt: number;
  estimatedCredits: number | null;
  modelId: string;
  nodeId: string;
  prompt: string;
  resultCount: number;
  results: FlowImageResultItem[];
  routeKey: string;
  size: string;
  status: WorkbenchBatchStatus;
  workflowRunId: string | null;
};
