import { verifyTaskDelivery, type AgentDeliveryActual, type AgentDeliveryExpected, type DeliveryCheckResult } from "../v3/agent-delivery-verifier.js";
import { CanvasOperationService, type AppliedCanvasOperationSet } from "../v3/canvas-operation-service.js";
import type { CanvasOperationEnvelope } from "../v3/canvas-operation-schema.js";

export function buildV4DeliveryOperationSet(input: { taskId: string; baseRevision: number; delivery: DeliveryCheckResult }): CanvasOperationEnvelope {
  if (input.delivery.status !== "verified") throw new Error("AGENT_V4_DELIVERY_NOT_VERIFIED");
  const operations = input.delivery.items.flatMap((item, index) => {
    if (!item.assetId) return [];
    return [{ type: "result.place" as const, result: { assetId: item.assetId, position: { x: (index % 4) * 320, y: Math.floor(index / 4) * 240 }, nodeType: "image", label: item.id } }];
  });
  if (operations.length !== input.delivery.items.length || operations.length === 0) throw new Error("AGENT_V4_DELIVERY_ASSET_MISSING");
  return { operationSetId: `v4:${input.taskId}:delivery`, taskId: input.taskId, turnId: input.taskId, baseRevision: input.baseRevision, summary: "Place verified Canvas Agent V4 delivery assets", risk: "safe", requiresApproval: false, preconditions: [], expectedEffects: [], operations };
}

export function verifyV4Delivery(input: { tenantId: string; taskId: string; flowId: string; expected: AgentDeliveryExpected[]; actual: AgentDeliveryActual[] }): DeliveryCheckResult {
  return verifyTaskDelivery(input);
}

export async function commitV4Delivery(service: CanvasOperationService, input: { tenantId: string; projectId: string; flowId: string; taskId: string; operationSet: CanvasOperationEnvelope; delivery: DeliveryCheckResult }): Promise<AppliedCanvasOperationSet> {
  if (input.delivery.status !== "verified") throw new Error("AGENT_V4_DELIVERY_NOT_VERIFIED");
  return service.applyApprovedOperationSet({ tenantId: input.tenantId, projectId: input.projectId, flowId: input.flowId, taskId: input.taskId, operationSet: input.operationSet });
}
