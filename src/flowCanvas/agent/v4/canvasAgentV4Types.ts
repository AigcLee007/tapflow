export type CanvasAgentV4RuntimeIdentity = "v4_real" | "unavailable";
export type CanvasAgentV4SuitePlan = { mainImageCount: number; detailPageCount: number; pages: Array<{ pageKey: string; purpose: string; dependsOn: string[] }> };
export type CanvasAgentV4VisualBible = { productLock: string; palette: string[]; lighting: string; background: string; typography: string; composition: string; prohibitions: string[] };
export type CanvasAgentV4PromptItem = { itemId: string; prompt: string; referenceAssetIds?: string[] };
export type CanvasAgentV4Task = {
  id: string;
  status: string;
  lastSequence: number;
  events: Array<{ sequence: number; type: string; status?: string; suitePlan?: CanvasAgentV4SuitePlan; visualBible?: CanvasAgentV4VisualBible; promptSet?: CanvasAgentV4PromptItem[]; items?: CanvasAgentV4PromptItem[]; dependencyGraph?: Array<{ from: string; to: string }>; revision?: number; [key: string]: unknown }>;
  generationItems?: Array<{ itemId: string; pageKey?: string; status: string; assetId?: string; errorCode?: string; retryCount?: number }>;
};
