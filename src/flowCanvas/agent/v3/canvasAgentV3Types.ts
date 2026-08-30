export type CanvasAgentV3RuntimeIdentity = "v3_real" | "v2_real" | "unavailable" | "offline_demo";
export type CanvasAgentV3TaskStatus = "draft" | "observing" | "planning" | "preview_ready" | "waiting_for_input" | "waiting_for_approval" | "running" | "verifying" | "repairing" | "succeeded" | "partial_success" | "failed" | "cancelled";
export type CanvasAgentV3Event = { sequence: number; type: string; status?: CanvasAgentV3TaskStatus; payload?: Record<string, unknown> };
export type CanvasAgentV3Task = { id: string; status: CanvasAgentV3TaskStatus; lastSequence: number; events: CanvasAgentV3Event[] };
