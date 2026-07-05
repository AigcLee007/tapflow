import type { FlowNodeKind } from "../types";
import type { CanvasAgentOp, CanvasAgentPlannerOutput, CanvasAgentSnapshot } from "./canvasAgentTypes";
import { getCanvasAgentOpPermission } from "./canvasAgentTypes";

const ALLOWED_NODE_KINDS = new Set<FlowNodeKind>([
  "text",
  "image",
  "video",
  "audio",
  "upload",
  "image_editor",
  "storyboard",
  "director3d",
  "video_editor",
  "group",
]);

const ALLOWED_PATCH_KEYS = new Set([
  "activeCommandId",
  "agentMetadata",
  "batchCount",
  "generationPrompt",
  "height",
  "modelId",
  "multiImageDisplayMode",
  "params",
  "referenceAssetItemIds",
  "referenceOrder",
  "routeKey",
  "title",
  "width",
]);

export type CanvasAgentPolicyError = {
  code:
    | "APPROVAL_REQUIRED"
    | "NODE_NOT_FOUND"
    | "ROUTE_NOT_VISIBLE"
    | "UNSAFE_PATCH_FIELD"
    | "UNSUPPORTED_NODE_KIND";
  message: string;
};

export type CanvasAgentPolicyResult =
  | {
      ok: true;
      output: CanvasAgentPlannerOutput;
      requiresCreditConfirmation: boolean;
    }
  | {
      ok: false;
      errors: CanvasAgentPolicyError[];
    };

type PolicyInput = {
  availableRouteKeys: Set<string>;
  output: CanvasAgentPlannerOutput;
  snapshot: CanvasAgentSnapshot;
};

function checkRoute(routeKey: unknown, routes: Set<string>, errors: CanvasAgentPolicyError[]) {
  if (typeof routeKey !== "string" || !routeKey.trim()) return;
  if (!routes.has(routeKey)) {
    errors.push({
      code: "ROUTE_NOT_VISIBLE",
      message: "Agent plan referenced a route that is not visible to the current user.",
    });
  }
}

function validatePatch(op: Extract<CanvasAgentOp, { type: "update_node_data" }>, errors: CanvasAgentPolicyError[]) {
  Object.keys(op.patch).forEach((key) => {
    if (!ALLOWED_PATCH_KEYS.has(key)) {
      errors.push({
        code: "UNSAFE_PATCH_FIELD",
        message: `Agent cannot modify node field ${key}.`,
      });
    }
  });
}

export function validateCanvasAgentPlan(input: PolicyInput): CanvasAgentPolicyResult {
  const nodeIds = new Set(input.snapshot.nodes.map((node) => node.id));
  const errors: CanvasAgentPolicyError[] = [];
  let requiresCreditConfirmation = false;

  for (const op of input.output.proposedOps) {
    const permission = getCanvasAgentOpPermission(op);

    if ((permission === "confirmed_write" || permission === "credit_required") && !input.output.approvalRequired) {
      errors.push({
        code: "APPROVAL_REQUIRED",
        message: "This plan contains write or credit operations and must request user approval.",
      });
    }

    if (permission === "credit_required") requiresCreditConfirmation = true;

    if (op.type === "add_node") {
      if (!ALLOWED_NODE_KINDS.has(op.kind)) {
        errors.push({
          code: "UNSUPPORTED_NODE_KIND",
          message: `Unsupported node kind ${String(op.kind)}.`,
        });
      }
      checkRoute(op.data.routeKey, input.availableRouteKeys, errors);
    }

    if (op.type === "update_node_data") {
      if (!nodeIds.has(op.nodeId)) {
        errors.push({
          code: "NODE_NOT_FOUND",
          message: "The node targeted for update does not exist.",
        });
      }
      validatePatch(op, errors);
      checkRoute(op.patch.routeKey, input.availableRouteKeys, errors);
    }

    if (op.type === "delete_nodes" || op.type === "select_nodes") {
      op.nodeIds.forEach((nodeId) => {
        if (!nodeIds.has(nodeId)) {
          errors.push({
            code: "NODE_NOT_FOUND",
            message: `Node ${nodeId} does not exist.`,
          });
        }
      });
    }

    if (op.type === "run_node" && !nodeIds.has(op.nodeId)) {
      errors.push({
        code: "NODE_NOT_FOUND",
        message: "The node targeted for execution does not exist.",
      });
    }
  }

  return errors.length > 0
    ? { errors, ok: false }
    : { ok: true, output: input.output, requiresCreditConfirmation };
}
