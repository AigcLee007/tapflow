# Canvas Agent V3 Design

## Decision Summary

TapFlow will keep `@xyflow/react` as the production canvas engine and rebuild the Canvas Agent product layer around a controlled director loop. The Agent becomes a canvas-bound production director that observes, proposes, previews, executes, verifies, and repairs work. It is not a general chat assistant and it does not replace the existing Workflow Run, Worker, billing, asset, or remote-draft systems.

The V3 design combines four proven patterns:

- tldraw Agent Starter Kit: visual plus structured context, action utilities, modes, streaming, and decomposed managers;
- Flowise Agentflow: explicit graph semantics, node validation, programmatic canvas control, and natural-language flow generation;
- Heym and Dim0: board-aware agents, human approval, visible execution traces, and editable results written back to the board;
- ComfyUI: reusable subgraphs and durable, resumable generation jobs.

This is a conceptual adoption only. V3 does not add tldraw, Rete.js, Flowise, Heym, Dim0, or ComfyUI as a production dependency. A future tldraw technology spike may compare spatial-canvas capabilities, but it is not a prerequisite for V3.

## Product Goal

Make the Canvas Agent reliably complete production work from the current canvas context while keeping the user in control of canvas mutations, paid execution, destructive changes, and final delivery.

The primary user contract is:

```text
User goal
-> Agent observes the authoritative canvas
-> Agent proposes a visible, editable plan
-> User previews material canvas changes and cost
-> Agent executes through existing server boundaries
-> Agent verifies that required outputs were delivered
-> User can retry only failed steps or undo applied canvas changes
```

Success is measured by task correctness and verified delivery, not by conversational fluency.

## Current Problems

The current implementation contains valuable infrastructure, but its product and runtime boundaries have accumulated in ways that make the Agent difficult to trust and difficult to change.

### Product-layer overload

- `CanvasAgentPanel.tsx` owns capability loading, session selection, history, event replay, model settings, Skill browsing, Skill authoring, approvals, continuation prompts, result placement, composer references, and four workspace tabs.
- `AiFlowCanvas.tsx` owns canvas interaction and also directly composes Agent entry, Agent panel, canvas-op application, and server-draft application.
- Chat, history, connections, logs, Skill selection, execution plans, and result delivery share one right-side shell even though they have different jobs and information density.
- The current primary representation is a conversation timeline. The actual production task, planned graph change, cost, execution status, and delivery verification are secondary projections.

### Runtime split

- The legacy planner/executor and native-stream V2 turn loop use different tool names, event shapes, and completion semantics.
- V2 can call `finish` with a textual summary, while durable delivery checks may still be pending elsewhere.
- General Agent workspace state and Skill Run state are separate state machines with overlapping concepts such as approval, running, partial success, failure, and result delivery.
- Default-disabled V2 and Skill flags can leave the visible product on an older path. The current UI does not give the creator a persistent, unambiguous runtime identity.

### Context and action limitations

- The structured graph context cannot fully express what the user currently sees or the visual relationship among media nodes.
- The V2 context tool is broad, while the legacy registry mixes generation calls and canvas mutations. Neither presents a stable read/write/run capability model to the product.
- Canvas mutations carry a graph revision, but the product does not consistently preview the mutation, show preconditions, preserve an inverse patch, or explain the risk before approval.
- Completion can be inferred from a model response or run terminal state without proving that the required text or asset-backed output is visible and durable on the bound canvas.

## Design Principles

1. **Canvas first.** The canvas remains the primary workspace. The Agent is a control layer over it.
2. **One authoritative runtime.** Production V3 uses the native server-side tool loop. No silent legacy or local fallback is allowed.
3. **Observe before writing.** Read tools are automatic; material writes and paid execution are previewed and policy-checked.
4. **Operations, not prose.** A canvas change is represented by a validated operation with preconditions and a durable result.
5. **Delivery over completion text.** A task succeeds only when its declared delivery checks pass.
6. **Existing production boundaries stay authoritative.** Workflow Runs execute generation; billing reserves, settles, and refunds; assets store media; `flow_drafts` stores the graph.
7. **Product-safe context.** Provider credentials, base URLs, upstream model names, raw route internals, signed URLs, and secrets never enter creator-facing context or events.
8. **Step-level recovery.** Partial success preserves successful work and retries only failed or invalidated steps.
9. **Reversible canvas changes.** Approved canvas operations produce an inverse patch whenever the affected operation can be safely reversed.
10. **Small, replaceable modules.** Context, tools, policy, orchestration, event projection, and UI rendering have separate interfaces.

## Scope

### V3 first release

- one server-side Canvas Director per user turn;
- dual-channel canvas context: structured graph projection plus bounded visual captures;
- a namespaced tool registry divided into read, write, and run tools;
- plan, preview, approval, execution, verification, and repair states;
- a bottom canvas command bar and a right-side task sheet;
- ghost preview for proposed nodes, edges, updates, and destructive operations;
- declarative Skill manifest with input, output, tool, approval, cost, retry, and delivery contracts;
- durable replay of task, step, tool, approval, run, result, and verification events;
- step-level retry and canvas-op undo;
- explicit runtime identity and truthful disabled/unavailable states;
- authenticated staging acceptance before any production flag is enabled.

### Deferred

- replacing `@xyflow/react`;
- tldraw, Rete.js, or another canvas-engine migration;
- multi-Agent teams or user-visible subagents;
- arbitrary MCP, filesystem, browser, shell, or code-execution tools;
- public Skill marketplace, ratings, creator profiles, or revenue sharing;
- autonomous paid execution without an explicit product policy and user opt-in;
- long-term semantic memory beyond project-bound durable task history;
- real-time multiplayer canvas collaboration.

## Product Information Architecture

### Canvas command bar

A compact command bar is anchored to the bottom center of the canvas. It replaces the current expectation that the user must open a large chat panel before starting work.

The collapsed bar contains:

- prompt input;
- current selection and uploaded-reference chips;
- selected Skill chip, when present;
- a concise cost/runtime indicator when available;
- send and stop actions.

The bar expands vertically for multiline input and reference management but does not become the task history. It remains usable while the task sheet is closed.

### Task sheet

The right-side sheet is task-first, not tab-first. Its primary sections are:

1. **Goal**: the user's normalized production goal and bound references.
2. **Plan**: ordered steps, dependencies, risk, expected outputs, and editable safe parameters.
3. **Preview**: a concise summary of canvas mutations and the cost estimate.
4. **Run**: current step, elapsed state, per-step output, and retry/cancel controls.
5. **Delivery**: required outputs, verification result, canvas locations, and next-step actions.

Only the active task is visible by default. History, diagnostic logs, and model/provider administration are secondary destinations:

- task history opens in a separate drawer or page;
- detailed run logs open from `查看运行`;
- provider and connection management remains under protected account/admin routes;
- Skill selection opens as a temporary menu/sheet from the command bar.

### Canvas previews

Proposed canvas writes appear before approval:

- create: translucent ghost node with a dashed outline;
- connect: dashed preview edge;
- update: highlighted field and before/after summary;
- delete or overwrite: red risk treatment and affected-node count;
- run: a badge on each target node with estimated credits and batch count.

Ghost entities are projections only. They are never persisted to `flow_drafts` and never become authoritative React Flow nodes until approval succeeds.

### Runtime identity

The task sheet always shows one of:

- `真实 Agent`;
- `Agent 暂不可用`;
- `离线演示` in explicitly enabled local development only.

Production and staging must never silently fall back from the real runtime to a deterministic or browser-local planner.

## Runtime Architecture

```text
Canvas Command Bar
  -> POST/stream V3 turn
  -> AgentContextAssembler
       -> structured canvas projection
       -> visual context capture references
       -> product-safe model/pricing catalog
       -> recent run and delivery summaries
  -> CanvasDirectorLoop
       -> AgentModePolicy
       -> CanvasToolRegistry
       -> OperationPolicy
       -> SkillRuntimeContract
  -> durable Agent events
  -> task projection
  -> ghost preview / approval
  -> canvas operation transaction or Workflow Run
  -> Worker + billing + assets
  -> DeliveryVerifier
  -> canvas placement / step-level repair
```

### Server modules

The implementation plan should converge the current legacy and V2 modules toward these responsibilities:

```text
apps/api/src/modules/agent/v3/
  agent-context-assembler.ts
  agent-visual-context.ts
  canvas-director-loop.ts
  canvas-director-prompt.ts
  canvas-tool-registry.ts
  canvas-tool-policy.ts
  canvas-operation-schema.ts
  canvas-operation-service.ts
  agent-task-projector.ts
  agent-delivery-verifier.ts
  agent-runtime-observability.ts
```

These names are design targets, not a requirement to create every file in the first commit. Existing focused modules should be reused when their contracts match. The implementation must avoid copying legacy and V2 logic into a third parallel stack.

### Frontend modules

```text
src/flowCanvas/agent/v3/
  CanvasAgentCommandBar.tsx
  CanvasAgentTaskSheet.tsx
  CanvasAgentGoalSection.tsx
  CanvasAgentPlanSection.tsx
  CanvasAgentPreviewSection.tsx
  CanvasAgentRunSection.tsx
  CanvasAgentDeliverySection.tsx
  CanvasAgentGhostLayer.tsx
  useCanvasAgentTask.ts
  useCanvasAgentTaskStream.ts
  canvasAgentTaskProjection.ts
  canvasAgentV3Types.ts
```

The existing `CanvasAgentPanel` remains as the feature-flagged V2 shell until V3 acceptance. V3 is composed beside it under a mutually exclusive flag, not inserted into the existing 605-line component.

## Context Contract

### Structured context

The model receives a bounded, product-safe projection:

```ts
type CanvasDirectorContext = {
  task: {
    userGoal: string;
    selectedSkill?: { id: string; version: number; name: string };
  };
  binding: {
    projectId: string;
    flowId: string;
    graphRevision: number;
  };
  viewport: {
    x: number;
    y: number;
    zoom: number;
    visibleNodeIds: string[];
  };
  selection: {
    nodeIds: string[];
    assetRefs: Array<{ refId: string; assetId: string; label: string }>;
  };
  graph: {
    nodes: CanvasNodeSummary[];
    edges: CanvasEdgeSummary[];
    offscreenClusters: CanvasClusterSummary[];
  };
  catalog: {
    productModels: ProductModelSummary[];
    pricingAvailability: PricingAvailabilitySummary[];
  };
  recentRuns: RecentRunSummary[];
  visualContext: VisualContextRef[];
};
```

Node summaries include only fields that are useful for reasoning and allowed for the node kind. Media payloads remain `assetId` references. Signed URLs, `data:` URLs, `blob:` URLs, base64, provider configuration, credentials, and raw Authorization data are excluded.

### Visual context

Visual context is bounded and derived from the current canvas, not stored as authoritative graph data.

Supported capture types:

- current viewport;
- selected-node bounding box;
- explicit user-marked region;
- optional low-resolution overview for offscreen spatial structure.

Each capture is represented to the Agent by a short-lived server-authorized reference. The database may store capture metadata and an audit reference, but `flow_drafts.graph_json` must not store the image payload or a long-lived signed URL.

Visual context is generated only when the selected model supports the required vision input and when the task benefits from spatial understanding. Structured context remains mandatory and authoritative for node IDs, graph relationships, prices, and revisions.

### Context budgets

Defaults:

- at most 60 detailed nodes;
- at most 12 selected nodes;
- at most 12 recent run summaries;
- at most 4 visual captures;
- bounded text and metadata per node kind;
- offscreen nodes summarized into clusters before omission.

If a task needs context outside these bounds, the Director must call a scoped read tool instead of receiving an unbounded initial snapshot.

## Tool Protocol

### Namespaces

The V3 model-facing registry uses stable names grouped by authority.

Read tools execute automatically:

```text
canvas.get_summary
canvas.get_selection
canvas.inspect_nodes
canvas.inspect_region
canvas.find_assets
catalog.list_models
run.get_status
task.get_delivery_state
skill.load
```

Canvas write tools create proposed operations:

```text
canvas.propose_create
canvas.propose_update
canvas.propose_connect
canvas.propose_delete
canvas.propose_group
canvas.propose_arrange
canvas.propose_place_results
```

Run tools cross the production boundary:

```text
workflow.estimate
workflow.propose_run
workflow.await_results
workflow.cancel
workflow.retry_failed_steps
```

Control tools:

```text
task.ask_user
task.update_plan
task.verify_delivery
task.finish
```

The model does not receive a direct `canvas.apply_ops` tool. It proposes operations. A trusted service validates, persists the preview, obtains approval when required, and applies the approved operation set with strict revision CAS.

### Canvas operation contract

```ts
type CanvasOperationEnvelope = {
  operationSetId: string;
  taskId: string;
  turnId: string;
  baseRevision: number;
  summary: string;
  risk: "safe" | "destructive" | "paid" | "batch";
  requiresApproval: boolean;
  operations: CanvasOperation[];
  preconditions: CanvasOperationPrecondition[];
  expectedEffects: CanvasExpectedEffect[];
  inverseOperations?: CanvasOperation[];
};
```

Initial operation types:

```text
node.create
node.update_data
node.delete
edge.connect
edge.delete
group.create
layout.move
selection.set
result.place
```

Every operation has a stable `opId`. Node creation uses a server-generated or validated client reference that is resolved once. Idempotent retries return the original mapping and do not create duplicate nodes.

### Preconditions

Supported preconditions include:

- graph revision equals `baseRevision`;
- target node exists and belongs to the flow;
- target node kind matches;
- selected node set still matches when the instruction depends on selection;
- editable field is allowed for the node kind;
- referenced asset exists and belongs to the tenant;
- pricing exists for every proposed paid target;
- referenced model remains creator-visible and active.

Failed preconditions never trigger automatic destructive rebasing. The task returns to `needs_review` with a refreshed preview.

### Risk and approval

Automatic after preview:

- reading context;
- selection-only changes;
- non-destructive layout changes when the user has enabled safe auto-apply;
- adding non-running planning text nodes when the current task explicitly requests them.

Approval required:

- any paid generation;
- batch execution;
- video generation;
- delete, overwrite, or destructive crop/replace;
- changing a model or generation settings on existing runnable nodes;
- applying changes to more than 12 nodes;
- placing results when the graph revision changed after the run began.

The server policy is authoritative. The model cannot lower the risk or waive approval.

## Canvas Director Loop

### Modes

V3 adopts a small mode system instead of exposing every tool in every phase.

```text
observe  -> read tools only
plan     -> read tools + plan updates
preview  -> proposal tools + estimates
execute  -> approved operation/run execution only
verify   -> run/result reads + delivery verification
repair   -> scoped reads + failed-step retry proposals
```

Mode transitions are controlled by the server state machine. A Skill can narrow the available tools within a mode but cannot grant tools outside the platform allowlist.

### Task state

```ts
type CanvasAgentTaskStatus =
  | "draft"
  | "observing"
  | "planning"
  | "preview_ready"
  | "waiting_for_input"
  | "waiting_for_approval"
  | "applying_canvas_ops"
  | "running"
  | "verifying"
  | "repairing"
  | "needs_review"
  | "succeeded"
  | "partial_success"
  | "failed"
  | "cancelled";
```

Terminal success requires a passing delivery report. `task.finish` is rejected when required delivery items are missing, non-durable, still running, or not placed according to the Skill contract.

### Loop behavior

1. Persist the user goal and authoritative canvas binding.
2. Assemble initial structured and visual context.
3. Enter `observe`; allow scoped reads.
4. Enter `plan`; persist an ordered plan with expected deliveries.
5. Enter `preview`; validate proposed canvas operations and run estimates.
6. If approval is required, persist the preview and stop in `waiting_for_approval`.
7. Apply approved canvas operations with strict revision CAS.
8. Launch Workflow Runs through existing billing and queue boundaries.
9. Await durable Worker/run events. SSE is a live enhancement; replay remains authoritative.
10. Enter `verify`; compare outputs with expected deliveries.
11. If verification fails and a safe bounded repair exists, enter `repairing`.
12. Finish as `succeeded`, `partial_success`, `failed`, or `needs_review` with delivery evidence.

The default round limit is eight model tool rounds across observe, plan, preview, and repair. Waiting for approval or asynchronous workflow results suspends the loop without consuming rounds. Resume uses the same task and durable event sequence.

## Skill Contract V2

### Principle

A Skill is a versioned executable contract over platform tools, not a prompt fragment and not an arbitrary code package.

```ts
type AgentSkillManifestV2 = {
  schemaVersion: 2;
  id: string;
  version: number;
  name: string;
  summary: string;
  modality: "text" | "image" | "video" | "mixed";
  intent: {
    description: string;
    examples: string[];
  };
  inputs: AgentSkillInputSchema[];
  outputs: AgentSkillOutputSchema[];
  allowedTools: string[];
  steps: AgentSkillStepTemplate[];
  approvalPolicy: AgentSkillApprovalPolicy;
  pricingPolicy: AgentSkillPricingPolicy;
  retryPolicy: AgentSkillRetryPolicy;
  deliveryChecks: AgentSkillDeliveryCheck[];
  uiSchema?: AgentSkillUiSchema;
  graphTemplate?: AgentSkillGraphTemplate;
};
```

### Validation

Publishing a V2 Skill requires:

- schema validation;
- allowlisted tool validation;
- graph-template validation with fresh-ID instantiation;
- input and output reference validation;
- delivery checks for every declared output;
- explicit approval policy for paid, batch, destructive, and video steps;
- no provider, credential, base URL, arbitrary executable, or secret fields;
- at least one passing fixture-based test for official Skills.

Private draft Skills may remain untested but cannot be enabled for production runtime until a test passes. Official Skill versions are immutable after publish.

### Migration

Existing published Skills remain readable as schema version 1. A server-side adapter projects them into a restricted V2 contract:

- existing normalized actions map to allowed V3 tools;
- existing input hints become typed optional/required inputs;
- existing graph templates remain bounded and validated;
- missing delivery checks make the migrated Skill unavailable for production execution until an administrator republishes it;
- saved Skill IDs and version numbers remain stable.

No existing `route_key`, session, Skill Run, or Workflow Run identifiers are rewritten.

## Persistence and Events

### Existing tables remain authoritative

Reuse the current tenant-scoped Agent session, turn, tool-call, task/event, Skill, Skill version, Skill Run, Skill step, Workflow Run, billing, asset, and flow-draft tables. The first V3 slice should prefer additive metadata and event payloads over new tables.

Any new table introduced during implementation must include `tenant_id`, tenant-scoped indexes, and the existing RLS context pattern.

### Durable events

V3 projects the UI from ordered server events:

```text
task.created
context.assembled
plan.updated
preview.created
approval.requested
approval.accepted
approval.rejected
canvas.apply_started
canvas.apply_completed
canvas.apply_failed
run.started
run.progress
run.completed
run.failed
delivery.verification_started
delivery.item_verified
delivery.item_failed
repair.proposed
repair.started
task.succeeded
task.partial_success
task.failed
task.cancelled
```

Each event includes task, turn, flow, sequence, idempotency, and sanitized public payload metadata. Provider internals stay in protected operational logs only.

SSE streams these events for responsiveness. Reconnect fetches events after the last accepted sequence. The frontend reducer ignores duplicates and cannot move a terminal task or step back to a non-terminal state.

## Delivery Verification

Delivery verification is mandatory and Skill-aware.

Examples:

- text output: non-empty bounded text exists in an authoritative canvas text node;
- image output: an owned `assetId` exists, its asset is ready, and a bound image node references it;
- video output: an owned video asset is ready with expected metadata and a bound video node references it;
- batch output: required item count is satisfied or the task becomes `partial_success`;
- graph output: expected node kinds and declared connections exist at the accepted revision;
- edit output: the result asset has lineage to the declared source reference.

A provider success, Workflow Run success, assistant message, transient preview URL, or base64 response alone never satisfies delivery.

## Billing and Execution

V3 preserves the existing sequence:

```text
estimate
-> reserve
-> enqueue/run
-> settle on verified provider success
-> refund/release on failure
```

Rules:

- missing pricing returns `PRICING_NOT_FOUND` before run creation;
- every paid proposal includes creator-safe estimate items;
- approval is scoped to task, operation set, graph revision, and estimate snapshot;
- repeated approval uses the existing idempotent claim pattern and cannot create duplicate Workflow Runs;
- retry uses a new execution attempt linked to the original failed step and bills only the retry according to current server policy;
- canvas undo does not refund a successfully delivered generation;
- provider success with failed canvas placement remains a delivery-placement repair, not a provider rerun.

## Security and Privacy

- Canvas and Skill content are untrusted model input, never system instructions.
- The Agent cannot call arbitrary URLs, HTTP, MCP, browser, filesystem, shell, or code execution in V3 first release.
- Tool results are redacted before entering the model loop or creator-facing event stream.
- `assetId` is the durable media identity. Signed preview URLs are temporary UI conveniences.
- Tenant, user, project, flow, session, turn, Skill, task, and Workflow Run ownership are checked at every write and resume boundary.
- Visual captures are scoped to the current flow and expire; they are not exposed across tenants.
- Approval payloads contain product labels, counts, risk, and estimates but no provider or credential internals.
- The frontend never mutates billing state directly.

## Error Handling

Product-visible errors use stable codes and recovery actions.

```text
AGENT_V3_DISABLED                 -> normal canvas remains usable
AGENT_RUNTIME_UNAVAILABLE        -> retry; no fallback
AGENT_CONTEXT_TOO_LARGE          -> Agent requests a smaller region/selection
AGENT_VISUAL_CONTEXT_FAILED      -> continue with structured context when safe
AGENT_TOOL_ARGUMENTS_INVALID     -> bounded model repair
AGENT_TOOL_NOT_ALLOWED           -> fail closed and log policy rejection
FLOW_DRAFT_REVISION_CONFLICT     -> refresh preview; never silent rebase
AGENT_APPROVAL_STALE             -> rebuild estimate/preview
PRICING_NOT_FOUND                -> block paid execution
AGENT_DELIVERY_INCOMPLETE        -> repair placement or mark partial success
AGENT_REPAIR_LIMIT_EXCEEDED      -> needs review
AGENT_EVENT_STREAM_DISCONNECTED  -> replay by sequence
```

Creator-facing errors explain what failed, what remains safe, whether credits were reserved/settled/refunded, and the next available action.

## Observability and Evaluation

### Runtime metrics

Record protected metrics for:

- runtime identity and model route ID in admin-only logs;
- first visible event latency;
- context assembly duration and size;
- visual-capture success/failure;
- tool rounds;
- tool validation and policy rejection counts;
- plan-to-approval duration;
- Workflow Run duration;
- delivery verification duration;
- repair attempts;
- task terminal status;
- credits estimated, reserved, settled, and refunded.

Creator-facing logs show product-safe step names, statuses, durations, estimates, run IDs, node IDs, and asset IDs only.

### Golden task suite

Before implementation acceptance, define at least twenty authenticated fixtures covering:

- empty-canvas text, image, and video creation;
- selected-node edits;
- multi-reference edits;
- “上一轮第 2 张” continuation;
- graph creation and connection;
- batch generation;
- stale graph revision;
- missing pricing;
- partial batch failure;
- provider success plus placement failure;
- cancel before and after reserve;
- refresh/replay during approval and during execution;
- malicious instructions embedded in a node or Skill;
- unavailable model/route;
- step-level retry;
- undo of canvas operations.

Primary acceptance metrics:

- at least 90% correct plan and target selection across the golden tasks;
- at least 99% schema-valid model tool calls after at most one repair;
- zero unapproved paid runs;
- at least 95% successful authoritative result placement after successful generation;
- zero cross-tenant access or secret exposure;
- p95 first visible event under 2 seconds in staging, excluding provider generation time;
- every terminal success has passing delivery evidence;
- failed-step retry does not repeat successful paid steps.

## Testing Strategy

### Unit tests

- context budgets and redaction;
- visual-context reference projection;
- tool schemas and policy;
- operation preconditions and inverse operations;
- task and mode state machines;
- event reducer idempotency;
- Skill V1-to-V2 adapter;
- delivery checks by modality;
- pricing and approval policy;
- step-level retry selection.

### API and database tests

- auth, tenant, project, flow, session, and task ownership;
- strict graph revision conflict;
- approval idempotency;
- operation application transaction;
- Workflow Run launch and Skill-step linkage;
- durable replay after disconnect;
- result placement with asset ownership;
- terminal delivery verification;
- RLS for any new persistence.

### Frontend tests

- command bar references and selected Skill;
- task sheet state projection;
- ghost preview without draft mutation;
- approval, cancel, retry, and undo controls;
- runtime identity and truthful unavailable state;
- reconnect/replay;
- menu density, dismissal, keyboard navigation, and z-index;
- no-Skill and V2 rollback paths remain isolated.

### End-to-end staging acceptance

Use authenticated PostgreSQL, Redis/BullMQ, S3-compatible storage, real priced provider routes, and the browser UI. Validate login, project canvas hydration, selection references, plan preview, approval, billing reserve/settle/refund, Worker execution, asset creation, result placement, refresh/replay, failure recovery, and rollback flags.

## Rollout and Rollback

Introduce mutually exclusive flags:

```text
AGENT_V3_ENABLED=false
AGENT_V3_RUNTIME_ENABLED=false
VITE_AGENT_V3_ENABLED=false
```

Suggested rollout:

1. local golden-task fixtures with fake provider runtime;
2. local full-stack authenticated tests;
3. staging for admin users only;
4. staging cohort with real priced image routes;
5. add text and video Skills after modality delivery checks pass;
6. production cohort;
7. broader enablement after metric review.

V2 and V3 are mutually exclusive per frontend build/session. V3 reads existing sessions and Skills through adapters but writes its own version marker to turns and events.

Rollback disables V3 flags and restores the existing V2 shell. Durable tasks, events, Skill versions, Workflow Runs, assets, flow drafts, and billing records are preserved. Broken AI routes are set inactive rather than deleted. Worker is stopped before any rollback migration that affects workflow behavior.

## Implementation Slices

### Slice 0: Evaluation and runtime truth

- add the golden task fixtures and scoring rubric;
- surface explicit runtime identity;
- remove silent production/staging fallback;
- add baseline task and delivery metrics.

### Slice 1: Protocol foundation

- define task, event, tool, operation, preview, approval, and delivery contracts;
- implement read/write/run policy separation;
- add strict operation validation, preconditions, idempotency, and inverse patches;
- project V3 events without changing the visible production UI.

### Slice 2: Director loop

- implement modes and durable suspend/resume;
- assemble structured context;
- add plan and delivery contracts;
- execute approved canvas operations and Workflow Runs;
- verify outputs and retry failed steps.

### Slice 3: Agent Dock V3

- add the command bar, task sheet, and ghost preview layer;
- move history/logs/connection management out of the primary task surface;
- preserve shared menu tokens and canvas z-index rules;
- add focused UI regression tests.

### Slice 4: Visual context

- add current-view and selection capture references;
- enforce capture budgets, expiry, and product-safe projection;
- add vision-capability routing and structured-only fallback when safe.

### Slice 5: Skill Contract V2

- add manifest schema and V1 adapter;
- add fixture-based Skill testing and publish gating;
- migrate official Skills without changing IDs or versions;
- add delivery contracts and step-level retry controls.

### Slice 6: Staging acceptance and release

- run the complete authenticated acceptance matrix;
- review latency, success, placement, billing, and repair metrics;
- document enablement and rollback;
- keep V3 disabled until every release gate passes.

## Open-source References and Adoption Limits

- tldraw Agent Starter Kit: <https://github.com/tldraw/tldraw/blob/main/apps/docs/content/starter-kits/agent.mdx>
- tldraw SDK and production licensing note: <https://github.com/tldraw/tldraw>
- Flowise Agentflow: <https://github.com/FlowiseAI/Flowise/blob/main/packages/agentflow/README.md>
- Heym: <https://github.com/heymrun/heym>
- Dim0: <https://github.com/vcmf/dim0>
- Rete.js: <https://github.com/retejs/rete>
- Excalidraw: <https://github.com/excalidraw/excalidraw>
- ComfyUI subgraph RFC: <https://github.com/Comfy-Org/rfcs/blob/main/rfcs/0005-subgraph.md>

These sources inform interaction and architecture patterns only. Implementation must be original or comply with the exact upstream license. No source-available or copyleft code is copied into TapFlow without an explicit license review.

## Acceptance Criteria

1. The creator can start a task from a canvas command bar with selected nodes, uploaded assets, and an optional Skill.
2. The Agent visibly identifies the real V3 runtime and never silently falls back in staging or production.
3. The Agent uses product-safe structured context and bounded visual context without persisting media payloads or signed URLs in `flow_drafts`.
4. Every material canvas mutation is represented by a validated operation set with revision, preconditions, risk, expected effects, and optional inverse operations.
5. Proposed nodes, edges, updates, deletes, and runs are visible as a non-authoritative ghost preview before approval.
6. Paid, batch, video, destructive, overwrite, and stale-revision work cannot execute without the required server approval.
7. Generation uses existing Workflow Run, Worker, billing, asset, and draft persistence boundaries.
8. Successful tasks contain immutable delivery evidence proving that required text or asset-backed outputs are durable and bound to the canvas.
9. Partial failure preserves successful outputs and offers failed-step retry without repeating successful paid steps.
10. Refresh and reconnect restore the same task, approval, run, result, and verification state from ordered durable events.
11. V1 Skills remain readable; production V3 execution requires a valid V2 contract and delivery checks.
12. V3 can be disabled without deleting or rewriting historical sessions, Skills, runs, assets, drafts, or billing records.
13. Focused frontend, API, Worker, AI Gateway, and DB tests pass; `npm run build` passes.
14. Authenticated staging acceptance with real infrastructure and priced provider routes passes before production enablement.
