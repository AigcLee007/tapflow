import type { Node } from "@xyflow/react";

import {
  DEFAULT_IMAGE_MODEL_ID,
  getDefaultImageSizeForModel,
  getImageModelById,
  getImageModelOptions,
  type ImageModelConfig,
} from "../../config/imageModels";
import type { V2WorkflowRunStatus } from "../../services/v2WorkflowRunsApi";
import { getDisplayImageCredits, getOfficialImageRouteSizeCredits } from "../utils/imageRoutePricing";
import type { FlowImageResultItem, FlowNodeData, FlowRuntimeNodeOutput, FlowWorkbenchNodeMetadata } from "../types";
import type { ImageWorkbenchBatch, ImageWorkbenchDraft, WorkbenchProjectMode } from "./imageWorkbenchTypes";

export type ViewportProbe = {
  coarsePointer: boolean;
  width: number;
};

export type WorkbenchModelOption = {
  defaultSize: string;
  id: string;
  label: string;
  routeLookupKey: string;
  sizeOptions: string[];
};

export const WORKBENCH_ASPECT_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
export const WORKBENCH_QUANTITY_OPTIONS = ["1", "2", "3", "4"];
export const WORKBENCH_FORMAT_OPTIONS = ["png", "jpeg", "webp"] as const;
export const WORKBENCH_QUALITY_OPTIONS = ["auto", "low", "medium", "high"] as const;
export const WORKBENCH_MODERATION_OPTIONS = ["auto", "low"] as const;

export function getProjectWorkbenchPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/workbench`;
}

export function getProjectCanvasPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/canvas`;
}

export function isMobileWorkbenchViewport(input: ViewportProbe): boolean {
  return input.coarsePointer || input.width < 768;
}

export function getPreferredProjectMode(input: ViewportProbe): WorkbenchProjectMode {
  return isMobileWorkbenchViewport(input) ? "workbench" : "canvas";
}

export function markWorkbenchNodeData<T extends Partial<FlowNodeData>>(
  data: T,
  input: { batchId: string; createdAt: number },
): T & { workbench: FlowWorkbenchNodeMetadata } {
  return {
    ...data,
    workbench: {
      batchId: input.batchId,
      createdAt: input.createdAt,
      source: "image-workbench",
    },
  };
}

export function isWorkbenchNodeData(data: Partial<FlowNodeData> | null | undefined): boolean {
  const metadata = data?.workbench as Partial<FlowWorkbenchNodeMetadata> | undefined;
  return metadata?.source === "image-workbench" && typeof metadata.batchId === "string";
}

export function getWorkbenchResultItems(input: {
  data: Partial<FlowNodeData>;
  runtimeOutput?: FlowRuntimeNodeOutput;
}): FlowImageResultItem[] {
  const generatedResults = Array.isArray(input.data.generatedResults)
    ? input.data.generatedResults.filter((item): item is FlowImageResultItem =>
        Boolean(item && typeof item.id === "string" && typeof item.url === "string"),
      )
    : [];
  if (generatedResults.length > 0) return generatedResults;

  const assets = Array.isArray(input.runtimeOutput?.assets) ? input.runtimeOutput.assets : [];
  return assets
    .filter((asset) => asset.kind === "image" && asset.downloadUrl && asset.assetId)
    .map((asset) => ({
      createdAt: Date.now(),
      id: `asset:${asset.assetId}`,
      url: String(asset.downloadUrl),
    }));
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readPositiveInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

function getNodeWorkbenchMetadata(data: Partial<FlowNodeData>): FlowWorkbenchNodeMetadata | null {
  const metadata = data.workbench as Partial<FlowWorkbenchNodeMetadata> | undefined;
  if (metadata?.source !== "image-workbench" || !metadata.batchId) return null;
  return {
    batchId: metadata.batchId,
    createdAt: typeof metadata.createdAt === "number" ? metadata.createdAt : 0,
    source: "image-workbench",
  };
}

function normalizeWorkbenchStatus(
  status: unknown,
  runtimeStatus: V2WorkflowRunStatus | undefined,
): ImageWorkbenchBatch["status"] {
  const resolved = String(runtimeStatus || status || "").trim().toLowerCase();
  if (resolved === "succeeded" || resolved === "success") return "success";
  if (resolved === "failed" || resolved === "error") return "error";
  if (resolved === "queued" || resolved === "pending" || resolved === "runnable") return "pending";
  if (resolved === "running" || resolved === "waiting_provider") return "running";
  return "idle";
}

export function deriveWorkbenchBatches(input: {
  nodeOutputByNodeId: Record<string, FlowRuntimeNodeOutput>;
  nodeRunStatusByNodeId: Record<string, V2WorkflowRunStatus>;
  nodes: Array<Node<FlowNodeData>>;
  workflowRunIdByNodeId: Record<string, string>;
}): ImageWorkbenchBatch[] {
  return input.nodes
    .filter((node) => node.type === "image" || node.data.kind === "image")
    .map((node) => {
      const metadata = getNodeWorkbenchMetadata(node.data);
      if (!metadata) return null;
      const params = node.data.params && typeof node.data.params === "object"
        ? node.data.params as Record<string, unknown>
        : {};
      const results = getWorkbenchResultItems({
        data: node.data,
        runtimeOutput: input.nodeOutputByNodeId[node.id],
      });
      const size = readString(params.size) || readString(params.imageSize) || readString(params.image_size) || "1k";
      const perImageCredits = getOfficialImageRouteSizeCredits(node.data.routeKey, size);
      return {
        aspectRatio: readString(params.aspect_ratio) || readString(params.aspectRatio) || "1:1",
        batchCount: readPositiveInteger(node.data.batchCount),
        batchId: metadata.batchId,
        createdAt: metadata.createdAt,
        estimatedCredits: getDisplayImageCredits(perImageCredits, node.data.batchCount),
        modelId: readString(node.data.modelId),
        nodeId: node.id,
        prompt: readString(node.data.generationPrompt) || readString(node.data.title),
        resultCount: results.length,
        results,
        routeKey: readString(node.data.routeKey),
        size: size.toUpperCase(),
        status: normalizeWorkbenchStatus(node.data.status, input.nodeRunStatusByNodeId[node.id]),
        workflowRunId: input.workflowRunIdByNodeId[node.id] || null,
      } satisfies ImageWorkbenchBatch;
    })
    .filter((batch): batch is ImageWorkbenchBatch => Boolean(batch))
    .sort((left, right) => right.createdAt - left.createdAt);
}

export function buildWorkbenchModelOptions(catalogItems: ImageModelConfig[] = []): WorkbenchModelOption[] {
  const source = (catalogItems.length > 0 ? catalogItems : getImageModelOptions())
    .filter((item) => item.isActive !== false);
  return source
    .map((item) => ({
      defaultSize: getDefaultImageSizeForModel(item.id),
      id: item.id,
      label: item.label,
      routeLookupKey: item.routeFamily || item.modelFamily || item.id,
      sizeOptions: item.sizeOptions?.length ? item.sizeOptions : [item.defaultSize || "1k"],
    }));
}

export function getDefaultWorkbenchDraft(catalogItems: ImageModelConfig[] = [], initialRouteKey = ""): ImageWorkbenchDraft {
  const modelOptions = buildWorkbenchModelOptions(catalogItems);
  const fallbackModelId = DEFAULT_IMAGE_MODEL_ID() || modelOptions[0]?.id || "pixellelabs.nano-banana-pro";
  const activeModel = modelOptions.find((item) => item.id === fallbackModelId) || modelOptions[0];
  const size = activeModel?.defaultSize || getDefaultImageSizeForModel(fallbackModelId);
  return {
    aspectRatio: "1:1",
    batchCount: 1,
    modelId: activeModel?.id || fallbackModelId,
    moderation: "auto",
    outputFormat: "png",
    prompt: "",
    quality: "auto",
    referenceAssetItemIds: [],
    routeKey: initialRouteKey,
    size,
  };
}

export function getWorkbenchAspectRatioOptions(model: ImageModelConfig | null | undefined): string[] {
  if (!model) return WORKBENCH_ASPECT_RATIOS;
  if (model.id === "gpt-image-2") {
    return ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"];
  }
  if (model.id === "pixellelabs.nano-banana-pro" || model.id === "pixellelabs.nano-banana-2") {
    return WORKBENCH_ASPECT_RATIOS;
  }
  const extra = Array.isArray(model.extraAspectRatios) ? model.extraAspectRatios.filter(Boolean) : [];
  return Array.from(new Set(["1:1", ...extra]));
}

export function buildWorkbenchImageSizeParamPatch(modelId: string, size: string): Record<string, string> {
  const normalizedSize = String(size || "").toLowerCase();
  if (modelId === "gpt-image-2") {
    return {
      size: normalizedSize,
    };
  }
  return {
    imageSize: normalizedSize.toUpperCase(),
    size: normalizedSize,
  };
}

export function getWorkbenchModelSummaryLabel(modelId: string): string {
  return getImageModelById(modelId)?.label || modelId;
}
