export type CanvasAgentV4RuntimeIdentity = "v4_real" | "unavailable";
export type CanvasAgentV4Task = { id: string; status: string; lastSequence: number; events: Array<{ sequence: number; type: string; status?: string; [key: string]: unknown }>; generationItems?: Array<{ itemId: string; status: string; assetId?: string; errorCode?: string }> };
