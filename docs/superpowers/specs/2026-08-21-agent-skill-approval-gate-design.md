# Agent Skill Approval Gate Design

## Goal

Ensure a selected Skill cannot create a credit-consuming workflow run until the
user has approved the server-generated plan in the canvas Agent timeline.

## Scope

This phase changes only the V2 `canvas.run_nodes` launch boundary. It keeps the
existing Workflow Run, Worker, asset, and billing paths as the sole execution
and reserve/settle/refund implementation.

The phase covers a selected text, image, or video Skill when it launches one
or more existing canvas nodes. It also covers a batch request (more than one
node) and an explicitly requested overwrite.

## Decision

The API, rather than the model or browser, determines approval requirements.
For every selected-Skill `canvas.run_nodes` call it will:

1. Reload the flow draft and validate the supplied graph revision and node IDs.
2. Resolve each requested node to its product-visible modality and server-side
   pricing/availability state.
3. Create idempotent `agent_skill_step_runs` before any workflow launch.
4. Evaluate `requiresSkillApproval` for each step. A priced text/image/video
   step, a multi-node batch, an overwrite, or a delivery action requires
   approval. Safe reads and unpriced draft-only writes do not.
5. When approval is required, transition the Skill Run from `planned` to
   `waiting_for_approval`, set its approval state to `pending`, transition the
   affected steps to `waiting_for_approval`, and return an approval payload.
6. Do not call `V2WorkflowRunAdapter`, create a Workflow Run, reserve credits,
   or enqueue Worker work before approval.

The existing approval endpoint will be extended to load the immutable pending
plan, verify its session/turn/flow binding and graph revision, atomically mark
the run approved, then launch only the recorded target nodes. Duplicate
approval requests return the already-running run and never enqueue a second
workflow.

## Durable Plan Snapshot

The `agent_skill_runs.budget_snapshot` JSON is the immutable approval payload
for this phase. It stores only product-safe data:

- `nodeIds` and their Skill step IDs
- product modality and product-visible model label when available
- estimated credit amount or unavailable-pricing state
- `batch`, `overwrite`, and approval reason flags
- session, turn, flow, and graph revision bindings already stored in columns

It must not store raw route keys, provider names, credentials, base URLs,
signed URLs, or media bytes.

The approval response is projected through the existing Agent event redaction
boundary. The browser receives a concise title, affected-node count, estimated
credits when available, and the approval ID; it does not receive provider
configuration.

## Failure Handling

- Missing pricing fails closed with `PRICING_NOT_FOUND`; no approval and no
  workflow run are created.
- Inactive/unavailable target nodes fail before a workflow run is created.
- A stale graph revision returns `FLOW_DRAFT_REVISION_CONFLICT` both before
  planning and again at approval time.
- Cancelling a pending approval marks the Skill Run and pending steps
  cancelled/rejected and prevents later approval.
- A rejected, cancelled, terminal, or mismatched approval returns a stable
  stale-approval error without side effects.

## Non-Goals

This phase does not enable the V2 or Skill feature flags, add a second billing
path, expose raw route keys to the client, execute normalized Skill method
steps, or mark final Skill delivery success. Those are separate follow-up
phases after this approval gate is complete.

## Tests

Tests must begin red and cover:

- a priced text/image/video Skill launch waits for approval and does not invoke
  `V2WorkflowRunAdapter`;
- an approved run launches each planned node exactly once;
- duplicate approval does not launch additional workflow runs;
- stale graph revision, missing pricing, cancelled approval, and cross-session
  approval are rejected without workflow/billing side effects;
- only product-safe approval fields reach V2 events and browser replay state.

## Success Criteria

A selected paid Skill always produces a visible, durable approval state before
any credit-consuming execution. The current fallback Agent remains unchanged,
and all V2/Skill feature flags remain disabled until later runtime phases and
staging acceptance pass.
