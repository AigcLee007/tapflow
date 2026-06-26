import type { CanvasAgentActivityItem } from "./CanvasAgentActivityTimeline";
import type { AgentImageRunSettingsModel } from "./agentRunSettings";
import type { CanvasAgentToolAssetRef, CanvasAgentToolTimelineItem } from "./canvasAgentToolTypes";
import type { CanvasAgentMessage } from "./useCanvasAgentSession";

export type AgentWorkspaceTab = "chat" | "history" | "connections" | "logs";

export type AgentReferenceChip = {
  id: string;
  kind: "artifact" | "canvas_node" | "upload";
  label: string;
  assetId?: string;
  nodeId?: string;
  previewUrl?: string;
  refId?: string;
};

export type AgentResultAsset = CanvasAgentToolAssetRef;

export type AgentWorkspaceTimelineItem =
  | {
      content: string;
      createdAt?: string;
      id: string;
      kind: "message";
      references?: AgentReferenceChip[];
      role: CanvasAgentMessage["role"];
    }
  | {
      detail?: string;
      id: string;
      kind: "status";
      state: "active" | "completed" | "failed" | "queued";
      title: string;
    }
  | {
      id: string;
      kind: "parameter";
      models: AgentImageRunSettingsModel[];
      referenceRefs?: string[];
      toolCallKey: string;
    }
  | {
      id: string;
      kind: "tool";
      status: CanvasAgentToolTimelineItem["status"];
      summary: string;
      title: string;
      toolCallKey: string;
    }
  | {
      assets: AgentResultAsset[];
      id: string;
      kind: "result";
      placedNodeIds?: string[];
      toolCallKey: string;
    }
  | {
      id: string;
      kind: "error";
      message: string;
      retryable: boolean;
      title: string;
    };

export type BuildAgentWorkspaceTimelineInput = {
  activityItems: CanvasAgentActivityItem[];
  error: string | null;
  messages: CanvasAgentMessage[];
  toolItems: CanvasAgentToolTimelineItem[];
};
