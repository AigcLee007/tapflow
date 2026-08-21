# Agent Skill Approval Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent selected paid Skills from launching canvas workflow runs until the authenticated user approves a durable, server-generated plan.

**Architecture:** Add a pure approval-plan builder that maps validated canvas nodes to Skill step actions and product-safe plan fields. `AgentService` persists this plan in the existing Skill Run snapshot, transitions the run and steps to `waiting_for_approval`, and returns a redacted approval payload instead of calling the workflow adapter. The approval endpoint reloads and validates the stored plan, then atomically transitions the run to running and invokes the existing V2 workflow adapter exactly once.

**Tech Stack:** TypeScript, Fastify, PostgreSQL-backed `SkillRunService`, existing Workflow Run adapter, Zod, Vitest.

---

### Task 1: Define a pure approval-plan contract

**Files:**
- Create: `apps/api/src/modules/agent/agent-skill-approval-plan.ts`
- Create: `apps/api/test/agent-skill-approval-plan.test.ts`

- [ ] **Step 1: Write the failing approval-plan tests**

```ts
import { buildSkillLaunchApprovalPlan } from "../src/modules/agent/agent-skill-approval-plan.js";

it("requires approval for priced text, image, and video targets", () => {
  const plan = buildSkillLaunchApprovalPlan({
    flowId: "flow-1", graphRevision: 4, nodes: [
      { id: "text-1", type: "text", priced: true },
      { id: "image-1", type: "image", priced: true },
      { id: "video-1", type: "video", priced: true },
    ],
  });
  expect(plan.requiresApproval).toBe(true);
  expect(plan.targets.map((target) => target.action)).toEqual(["text", "image", "video"]);
});

it("does not include route, provider, credential, or URL fields", () => {
  const plan = buildSkillLaunchApprovalPlan({
    flowId: "flow-1", graphRevision: 4,
    nodes: [{ id: "image-1", type: "image", priced: true, routeKey: "internal.line", provider: "hidden" }],
  });
  expect(JSON.stringify(plan)).not.toMatch(/routeKey|provider|credential|https?:/i);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace @aigc-flow/api -- agent-skill-approval-plan`

Expected: FAIL because `agent-skill-approval-plan.js` does not exist.

- [ ] **Step 3: Implement the minimal pure planner**

```ts
export type SkillLaunchTarget = {
  action: "text" | "image" | "video";
  nodeId: string;
  priced: boolean;
};

export type SkillLaunchApprovalPlan = {
  batch: boolean;
  flowId: string;
  graphRevision: number;
  requiresApproval: boolean;
  targets: SkillLaunchTarget[];
};

export function buildSkillLaunchApprovalPlan(input: {
  flowId: string;
  graphRevision: number;
  nodes: Array<{ id: string; type?: string; priced: boolean }>;
}): SkillLaunchApprovalPlan {
  const targets = input.nodes.map((node) => ({
    action: node.type === "video" ? "video" : node.type === "image" ? "image" : "text",
    nodeId: node.id,
    priced: node.priced,
  }));
  return {
    batch: targets.length > 1,
    flowId: input.flowId,
    graphRevision: input.graphRevision,
    requiresApproval: targets.some((target) => target.priced) || targets.length > 1,
    targets,
  };
}
```

Use `requiresSkillApproval` for the final `requiresApproval` result so the
existing policy remains the single approval-rule authority.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace @aigc-flow/api -- agent-skill-approval-plan`

Expected: PASS with the planner tests green.

- [ ] **Step 5: Commit the pure contract**

```bash
git add apps/api/src/modules/agent/agent-skill-approval-plan.ts apps/api/test/agent-skill-approval-plan.test.ts
git commit -m "feat(agent): define skill launch approval plan"
```

### Task 2: Persist pending steps and return an approval payload

**Files:**
- Modify: `apps/api/src/modules/agent/agent.service.ts`
- Modify: `apps/api/src/modules/agent/agent-skill-run.service.ts`
- Modify: `apps/api/test/agent-v2-turn-loop.test.ts`
- Create: `apps/api/test/agent-skill-approval-launch.test.ts`

- [ ] **Step 1: Write the failing V2 launch test**

```ts
it("does not create workflow runs before a priced Skill launch is approved", async () => {
  const workflowRuns = { createWorkflowRun: vi.fn() };
  const result = await service.executeV2ToolForTest({
    name: "canvas.run_nodes",
    arguments: { expectedRevision: 4, nodeIds: ["image-1"] },
    selectedSkill: paidImageSkill,
  });
  expect(result).toMatchObject({ status: "waiting_for_approval" });
  expect(workflowRuns.createWorkflowRun).not.toHaveBeenCalled();
  expect(skillRun.steps[0]).toMatchObject({ status: "waiting_for_approval", approvalState: "pending" });
});
```

Expose a narrow test helper only if the existing V2 stream test seam cannot
drive `canvas.run_nodes`; prefer streaming a native tool-call fixture through
`V2AgentTurnLoop` so the test exercises the production boundary.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace @aigc-flow/api -- agent-skill-approval-launch`

Expected: FAIL because the current launch path immediately calls
`V2WorkflowRunAdapter.runNodes`.

- [ ] **Step 3: Persist the approval plan before launch**

In `AgentService.executeV2Tool` for `canvas.run_nodes`:

```ts
const plan = buildSkillLaunchApprovalPlan({
  flowId: snapshot.flowId!,
  graphRevision: expectedRevision,
  nodes: requestedNodeIds.map((nodeId) => resolveSkillLaunchNode(draftNodeById.get(nodeId))),
});
const steps = await Promise.all(plan.targets.map((target, stepIndex) =>
  this.skillRunService!.createStep({
    action: target.action,
    approvalState: plan.requiresApproval ? "pending" : "not_required",
    nodeId: target.nodeId,
    skillRunId,
    stepIndex,
    tenantId: context.tenantId,
  }),
));
if (plan.requiresApproval) {
  await Promise.all(steps.map((step) => this.skillRunService!.updateStep(context, step.id, {
    approvalState: "pending", status: "waiting_for_approval",
  })));
  await this.skillRunService!.transition(context, skillRunId, "planned", "waiting_for_approval", {
    approvalState: "pending",
    output: { approvalPlan: plan },
  });
  return { approvalId: skillRunId, nodeCount: plan.targets.length, status: "waiting_for_approval" };
}
```

Add a `replaceBudgetSnapshot` repository/service method rather than storing the
approval plan in `output_json`; the plan belongs in `budget_snapshot` and must
be written under the same tenant-scoped transaction before the state transition.
The method accepts only the defined approval-plan projection.

- [ ] **Step 4: Redact the approval result at the existing event boundary**

Update `agent-redaction.ts` so V2 approval results retain only:

```ts
{ approvalId: string; nodeCount: number; status: "waiting_for_approval"; estimatedCredits?: number }
```

Do not add route, provider, model-key, credential, base-URL, signed-URL, or
node-data pass-through fields.

- [ ] **Step 5: Run API tests to verify the waiting state**

Run: `npm run test --workspace @aigc-flow/api -- agent-skill-approval-launch agent-v2-turn-loop agent-v2-replay`

Expected: PASS; the adapter spy has zero calls before approval and replayed
events contain no internal routing data.

- [ ] **Step 6: Commit the pending-approval launch path**

```bash
git add apps/api/src/modules/agent/agent-skill-approval-plan.ts apps/api/src/modules/agent/agent-skill-run.service.ts apps/api/src/modules/agent/agent.service.ts apps/api/src/modules/agent/agent-redaction.ts apps/api/test/agent-skill-approval-launch.test.ts apps/api/test/agent-v2-turn-loop.test.ts
git commit -m "feat(agent): gate paid skill launches on approval"
```

### Task 3: Launch the durable approved plan exactly once

**Files:**
- Modify: `apps/api/src/modules/agent/agent.service.ts`
- Modify: `apps/api/src/modules/agent/agent.routes.ts`
- Modify: `apps/api/src/modules/agent/v2/v2-workflow-run-adapter.ts`
- Modify: `apps/api/test/agent-skill-approval-launch.test.ts`
- Modify: `apps/api/test/agent-v2-workflow-run-adapter.test.ts`

- [ ] **Step 1: Write the failing approval-replay tests**

```ts
it("launches the stored approved nodes once and links their step IDs", async () => {
  const first = await service.approveV2SkillRun(ctx, "run-1");
  await service.approveV2SkillRun(ctx, "run-1");
  expect(workflowRuns.createWorkflowRun).toHaveBeenCalledTimes(1);
  expect(first).toMatchObject({ status: "running" });
});

it("rejects a stale graph revision without creating workflow runs", async () => {
  await expect(service.approveV2SkillRun(ctx, "run-1")).rejects.toThrow("FLOW_DRAFT_REVISION_CONFLICT");
  expect(workflowRuns.createWorkflowRun).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace @aigc-flow/api -- agent-skill-approval-launch`

Expected: FAIL because `approveV2SkillRun` currently only changes run state.

- [ ] **Step 3: Implement atomic approve-and-launch behavior**

Replace the approval method with a service operation that:

```ts
const run = await this.skillRunService!.getRun(context, runId);
assertSkillRunBoundToSession(run, sessionIdFromRoute);
const plan = parseSkillLaunchApprovalPlan(run.budgetSnapshot.approvalPlan);
const draft = await this.flowsService.getFlowDraft(context, plan.flowId);
if (draft.revision !== plan.graphRevision) throw new AgentApiError(409, "FLOW_DRAFT_REVISION_CONFLICT", "画布已被其他修改，请刷新后重试。");
const approved = await this.skillRunService!.approve(context, runId);
const result = await this.workflowRunAdapter!.runNodes(context, {
  flowId: plan.flowId,
  graphRevision: plan.graphRevision,
  idempotencyKey: `skill-approval:${run.id}`,
  nodeIds: plan.targets.map((target) => target.nodeId),
  skillRunId: run.id,
  skillStepIds: Object.fromEntries(approved.steps.map((step) => [step.nodeId!, step.id])),
  skillVersionId: run.skillVersionId,
});
```

Use the stable `skill-approval:<run-id>` idempotency prefix. After successful
creation, update each planned step to `running` with its returned Workflow Run
ID. If adapter launch fails before any run is returned, transition the Skill
Run from `running` to `failed` with a safe error code; do not refund or reserve
credits here because the existing Workflow Run path owns billing.

Change the approval route to pass `sessionId` into this service method and
reject a run whose stored `sessionId`, `turnId`, or flow/project links do not
match the authenticated Agent session.

- [ ] **Step 4: Run the approval and adapter tests to verify they pass**

Run: `npm run test --workspace @aigc-flow/api -- agent-skill-approval-launch agent-v2-workflow-run-adapter agent-skill-run-service`

Expected: PASS; duplicate approval remains one workflow launch, stale plans
have no launch, and each returned workflow run is linked to its Skill step.

- [ ] **Step 5: Commit durable approval execution**

```bash
git add apps/api/src/modules/agent/agent.service.ts apps/api/src/modules/agent/agent.routes.ts apps/api/src/modules/agent/v2/v2-workflow-run-adapter.ts apps/api/test/agent-skill-approval-launch.test.ts apps/api/test/agent-v2-workflow-run-adapter.test.ts
git commit -m "feat(agent): launch approved skill plans once"
```

### Task 4: Cover cancellation and record the rollout boundary

**Files:**
- Modify: `apps/api/test/agent-skill-approval-launch.test.ts`
- Modify: `PROJECT_RECORD.md`
- Modify: `docs/CODEX_HANDOFF.md`

- [ ] **Step 1: Write failing cancellation and package-safety tests**

```ts
it("cancels a pending approval and prevents subsequent launch", async () => {
  await service.cancelV2Turn(ctx, "session-1", "user cancelled");
  await expect(service.approveV2SkillRun(ctx, "run-1", "session-1")).rejects.toThrow("SKILL_RUN_STALE_APPROVAL");
  expect(workflowRuns.createWorkflowRun).not.toHaveBeenCalled();
});

it("fails closed when a selected target lacks pricing", async () => {
  await expect(runPaidSkill("image-1")).rejects.toThrow("PRICING_NOT_FOUND");
  expect(workflowRuns.createWorkflowRun).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace @aigc-flow/api -- agent-skill-approval-launch`

Expected: FAIL until cancellation and pricing failures block durable launch.

- [ ] **Step 3: Add the smallest cancellation and fail-closed guards**

Ensure a cancellation transitions pending steps to `cancelled` or leaves their
existing terminal status unchanged. Ensure pricing resolution completes before
step creation and adapter invocation; translate expected pricing failure into
the existing `PRICING_NOT_FOUND` API code without leaking route fields.

- [ ] **Step 4: Run focused validation**

Run:

```bash
npm run test --workspace @aigc-flow/api -- agent-skill-approval-plan agent-skill-approval-launch agent-skill-policy agent-skill-run-service agent-v2-turn-loop agent-v2-replay agent-v2-workflow-run-adapter
npm run build --workspace @aigc-flow/api
git diff --check
```

Expected: all listed tests and API build pass; diff check has no output.

- [ ] **Step 5: Update the project record and handoff**

Record that the approval gate is implemented but `AGENT_V2_RUNTIME_ENABLED` and
`AGENT_SKILL_RUNTIME_ENABLED` remain false pending normalized-step dispatch,
delivery-check runtime integration, and real staging acceptance.

- [ ] **Step 6: Commit the guard and documentation**

```bash
git add apps/api/test/agent-skill-approval-launch.test.ts PROJECT_RECORD.md docs/CODEX_HANDOFF.md
git commit -m "test(agent): cover skill approval gate"
```
