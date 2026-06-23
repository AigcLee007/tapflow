export type CanvasAgentToolAssetRef = {
  assetId: string;
  height?: number;
  kind: "image" | "video";
  label: string;
  promptSummary: string;
  refId: string;
  width?: number;
};

export type CanvasAgentToolTimelineItem = {
  assetRefs: CanvasAgentToolAssetRef[];
  error?: string;
  estimate?: unknown;
  placedNodeIds?: string[];
  result?: unknown;
  status: "awaiting_approval" | "failed" | "running" | "succeeded";
  title: string;
  toolCallKey: string;
  toolName: string;
  turnId?: string;
};

export type CanvasAgentToolEvent =
  | { type: "message_delta"; content: string }
  | { type: "tool_started"; toolCallKey: string; toolName: string }
  | { type: "tool_progress"; message: string; toolCallKey: string }
  | { type: "tool_result"; result: unknown; toolCallKey: string }
  | { type: "approval_required"; estimate: unknown; toolCallKey: string; turnId: string }
  | { type: "turn_completed"; finalText: string; turnId: string }
  | { type: "turn_failed"; code: string; message: string; turnId?: string };
