import { verifyTaskDelivery, type AgentDeliveryActual, type AgentDeliveryExpected, type DeliveryCheckResult } from "../v3/agent-delivery-verifier.js";
import { CanvasOperationService, type AppliedCanvasOperationSet } from "../v3/canvas-operation-service.js";
import type { CanvasOperationEnvelope } from "../v3/canvas-operation-schema.js";

export function verifyV4Delivery(input: { tenantId: string; taskId: string; flowId: string; expected: AgentDeliveryExpected[]; actual: AgentDeliveryActual[] }): DeliveryCheckResult {
  return verifyTaskDelivery(input);
}

export async function commitV4Delivery(service: CanvasOperationService, input: { tenantId: string; projectId: string; flowId: string; taskId: string; operationSet: CanvasOperationEnvelope; delivery: DeliveryCheckResult }): Promise<AppliedCanvasOperationSet> {
  if (input.delivery.status !== "verified") throw new Error("AGENT_V4_DELIVERY_NOT_VERIFIED");
  return service.applyApprovedOperationSet({ tenantId: input.tenantId, projectId: input.projectId, flowId: input.flowId, taskId: input.taskId, operationSet: input.operationSet });
}
