import type { AgentV4GenerationItem } from "./agent-v4-types.js";

export type GenerationExecutor = (item: AgentV4GenerationItem, idempotencyKey: string) => Promise<{ assetId?: string; errorCode?: string }>;

export async function runGenerationBatch(items: AgentV4GenerationItem[], execute: GenerationExecutor, options: { concurrency?: number; signal?: AbortSignal } = {}): Promise<AgentV4GenerationItem[]> {
  const concurrency = Math.max(1, Math.min(8, options.concurrency ?? 3));
  const output = items.map((item) => ({ ...item, status: "queued" as const }));
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= output.length) return;
      const item = output[index];
      if (options.signal?.aborted) { item.status = "failed"; item.errorCode = "AGENT_V4_CANCELLED"; continue; }
      item.status = "running";
      try {
        const result = await execute(item, `v4:item:${item.itemId}`);
        if (result.assetId) { item.assetId = result.assetId; item.status = "succeeded"; }
        else { item.status = "failed"; item.errorCode = result.errorCode ?? "AGENT_V4_ASSET_NOT_CREATED"; }
      } catch { item.status = "failed"; item.errorCode = "AGENT_V4_GENERATION_FAILED"; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, output.length) }, worker));
  return output;
}

export async function retryFailedGenerationItems(items: AgentV4GenerationItem[], execute: GenerationExecutor, options?: { concurrency?: number; signal?: AbortSignal }): Promise<AgentV4GenerationItem[]> {
  return runGenerationBatch(items.filter((item) => item.status === "failed"), execute, options);
}
