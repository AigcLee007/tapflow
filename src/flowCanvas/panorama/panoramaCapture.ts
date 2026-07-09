import type { FlowNodeData } from "../types";
import { persistDerivedImageAsset } from "../utils/persistDerivedImageAsset";
import { clampPanoramaFov, wrapPanoramaDegrees } from "./panoramaViewerState";

export type PanoramaCaptureMode = "current" | "grid_2x2" | "grid_4x3";

export type PanoramaCaptureFrameSpec = {
  label: string;
  pitchDeg: number;
  yawOffsetDeg: number;
};

export type PanoramaCaptureFrameCaptureInput = PanoramaCaptureFrameSpec & {
  fovDeg: number;
  index: number;
  yawDeg: number;
};

export type PanoramaCaptureFrameResult = {
  dataUrl: string;
  height: number;
  width: number;
};

export type PanoramaCaptureFrameCapture = (
  input: PanoramaCaptureFrameCaptureInput,
) => Promise<PanoramaCaptureFrameResult>;

export type PanoramaCaptureNodePosition = {
  x: number;
  y: number;
};

export type PanoramaCaptureInput = {
  addImageNode: (
    kind: "image",
    position: PanoramaCaptureNodePosition,
    overrides?: Partial<FlowNodeData>,
    options?: { preserveSelection?: boolean; selected?: boolean },
  ) => { id: string };
  captureFrame: PanoramaCaptureFrameCapture;
  captureMode: PanoramaCaptureMode;
  currentFovDeg: number;
  frontYawDeg: number;
  groupNodesAsPanoramaCaptureSet: (nodeIds: string[], groupTitle: string) => { groupId: string | null };
  origin: PanoramaCaptureNodePosition;
  projectId: string | null;
  sourceAssetId?: string;
  sourceNodeId: string;
  sourceTitle: string;
  viewerNodeId: string;
};

export type PanoramaCaptureResult = {
  groupId: string | null;
  nodeIds: string[];
};

const CAPTURE_TILE_WIDTH = 280;
const CAPTURE_TILE_HEIGHT = 180;
const CAPTURE_GAP_X = 24;
const CAPTURE_GAP_Y = 24;

const FOUR_VIEW_FRAMES: PanoramaCaptureFrameSpec[] = [
  { label: "Front", pitchDeg: 0, yawOffsetDeg: 0 },
  { label: "Right", pitchDeg: 0, yawOffsetDeg: 90 },
  { label: "Back", pitchDeg: 0, yawOffsetDeg: 180 },
  { label: "Left", pitchDeg: 0, yawOffsetDeg: -90 },
];

const TWELVE_VIEW_PITCHES = [
  { label: "Top", pitchDeg: 40 },
  { label: "Middle", pitchDeg: 0 },
  { label: "Bottom", pitchDeg: -40 },
] as const;

export function buildPanoramaCaptureFrames(mode: PanoramaCaptureMode): PanoramaCaptureFrameSpec[] {
  if (mode === "current") {
    return [{ label: "Current View", pitchDeg: 0, yawOffsetDeg: 0 }];
  }

  if (mode === "grid_2x2") {
    return FOUR_VIEW_FRAMES;
  }

  return TWELVE_VIEW_PITCHES.flatMap((pitch) =>
    FOUR_VIEW_FRAMES.map((direction) => ({
      label: `${direction.label} ${pitch.label}`,
      pitchDeg: pitch.pitchDeg,
      yawOffsetDeg: direction.yawOffsetDeg,
    })),
  );
}

export function getPanoramaCaptureFov(mode: PanoramaCaptureMode, currentFovDeg: number): number {
  if (mode === "grid_2x2") return 90;
  if (mode === "grid_4x3") return 75;
  return clampPanoramaFov(currentFovDeg);
}

export function buildPanoramaCaptureGridPositions(
  count: number,
  origin: PanoramaCaptureNodePosition,
): PanoramaCaptureNodePosition[] {
  if (count <= 1) return [origin];

  const columns = count === 4 ? 2 : 4;
  const positions: PanoramaCaptureNodePosition[] = [];

  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const col = index % columns;
    positions.push({
      x: origin.x + col * (CAPTURE_TILE_WIDTH + CAPTURE_GAP_X),
      y: origin.y + row * (CAPTURE_TILE_HEIGHT + CAPTURE_GAP_Y),
    });
  }

  return positions;
}

export function buildPanoramaCaptureNodeTitle(sourceTitle: string, frameLabel: string): string {
  const title = String(sourceTitle || "").trim() || "360 Panorama";
  return `${title} - ${frameLabel}`;
}

export function buildPanoramaCaptureGroupTitle(sourceTitle: string, mode: PanoramaCaptureMode): string {
  const title = String(sourceTitle || "").trim() || "360 Panorama";
  const suffix =
    mode === "grid_2x2" ? "4-view capture" : mode === "grid_4x3" ? "12-view capture" : "current view";
  return `${title} - ${suffix}`;
}

export function shouldGroupPanoramaCaptures(count: number): boolean {
  return count > 1;
}

export async function capturePanoramaOutputs(input: PanoramaCaptureInput): Promise<PanoramaCaptureResult> {
  const frames = buildPanoramaCaptureFrames(input.captureMode);
  const positions = buildPanoramaCaptureGridPositions(frames.length, input.origin);
  const captureFovDeg = getPanoramaCaptureFov(input.captureMode, input.currentFovDeg);
  const createdNodeIds: string[] = [];

  for (const [index, frame] of frames.entries()) {
    const yawDeg = wrapPanoramaDegrees(input.frontYawDeg + frame.yawOffsetDeg);
    const capture = await input.captureFrame({
      ...frame,
      fovDeg: captureFovDeg,
      index,
      yawDeg,
    });

    const title = buildPanoramaCaptureNodeTitle(input.sourceTitle, frame.label);
    const persisted = await persistDerivedImageAsset({
      imageUrl: capture.dataUrl,
      metadata: {
        panoramaCaptureFrameLabel: frame.label,
        panoramaCaptureIndex: index + 1,
        panoramaCaptureMode: input.captureMode,
        panoramaFrontYawDeg: input.frontYawDeg,
        panoramaSourceNodeId: input.sourceNodeId,
        panoramaViewerNodeId: input.viewerNodeId,
      },
      naturalHeight: capture.height,
      naturalWidth: capture.width,
      projectId: input.projectId,
      source: "panorama-capture",
      sourceAssetId: input.sourceAssetId,
      title,
    });

    const node = input.addImageNode(
      "image",
      positions[index] ?? positions[positions.length - 1] ?? input.origin,
      {
        ...persisted.nodeData,
        editSourceNodeId: input.viewerNodeId,
        title,
      },
      { preserveSelection: true, selected: false },
    );
    createdNodeIds.push(node.id);
  }

  const groupId = shouldGroupPanoramaCaptures(createdNodeIds.length)
    ? input.groupNodesAsPanoramaCaptureSet(
        createdNodeIds,
        buildPanoramaCaptureGroupTitle(input.sourceTitle, input.captureMode),
      ).groupId
    : null;

  return {
    groupId,
    nodeIds: createdNodeIds,
  };
}
