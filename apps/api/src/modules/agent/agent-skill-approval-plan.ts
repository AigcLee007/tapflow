import { requiresSkillApproval } from "./agent-skill-policy.js";

export type SkillLaunchAction = "text" | "image" | "video";

export type SkillLaunchApprovalTarget = {
  action: SkillLaunchAction;
  nodeId: string;
  priced: boolean;
};

export type SkillLaunchApprovalPlan = {
  batch: boolean;
  flowId: string;
  graphRevision: number;
  requiresApproval: boolean;
  targets: SkillLaunchApprovalTarget[];
};

export function buildSkillLaunchApprovalPlan(input: {
  flowId: string;
  graphRevision: number;
  nodes: Array<{ id: string; type?: string; priced: boolean }>;
}): SkillLaunchApprovalPlan {
  const targets = input.nodes.map((node) => ({
    action: node.type === "video" || node.type === "video.generate" ? "video" : node.type === "image" || node.type === "image.generate" ? "image" : "text",
    nodeId: node.id,
    priced: node.priced,
  }) satisfies SkillLaunchApprovalTarget);
  const batch = targets.length > 1;

  return {
    batch,
    flowId: input.flowId,
    graphRevision: input.graphRevision,
    requiresApproval: targets.some((target) => requiresSkillApproval({ action: target.action, batch, priced: target.priced })),
    targets,
  };
}
