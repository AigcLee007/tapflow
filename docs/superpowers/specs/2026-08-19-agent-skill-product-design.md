# TapFlow Agent + Skill Product Design

## Scope

TapFlow keeps the canvas as the primary workspace and rebuilds the Agent + Skill product layer around it. The first release adopts the user-facing behavior shown in LibTV: a Skill is a short, human-readable professional creation guide; the Agent loads that guide, combines it with the current canvas and available platform capabilities, and plans an executable task.

The first release supports official Skills and private user Skills, image and video creation, conversational Skill authoring, editable Skill drafts, key-step approval, asset-backed outputs, and canvas write-back. It does not include a public Skill marketplace, ratings, author profiles, multi-agent role orchestration, or long-term memory.

## Product Model

```text
Canvas = primary workspace and durable visual state
Agent = context-aware planner and task orchestrator
Skill = reusable professional creation guide
Tools = constrained platform actions
Worker = asynchronous provider execution
Assets = durable media outputs
Billing = server-authoritative reserve/settle/refund
```

Skill authoring is intentionally simple. A user can say "create a travel-video Skill" and the Agent drafts:

- name and one-line description;
- usage scenarios;
- required and optional inputs;
- recommended creation method;
- expected outputs;
- conditions that require a follow-up question;
- modality: image, video, audio, or text (first release exposes image/video).

The user edits these fields as natural language and saves a private Skill. Internally, the API compiles the source into a validated normalized projection used for policy checks and execution planning. The normalized projection is never required in the creator-facing UI.

## Runtime Flow

```text
User selects a Skill
  -> Agent loads the published Skill version
  -> Agent reads sanitized canvas, selection, assets, model catalog, pricing, and recent runs
  -> Agent identifies missing inputs and asks only necessary questions
  -> Agent proposes a plan and safe canvas operations
  -> User approves credit-consuming, batch, overwrite, and delivery actions
  -> Skill run executes through existing Canvas Ops, workflow runs, Worker, AI Gateway, billing, and assets
  -> Agent checks delivery requirements
  -> Assets are persisted and result nodes are linked back to the Skill run
```

Skill text is guidance, not executable code. It cannot select provider credentials, expose route internals, bypass billing, write arbitrary node data, or call external URLs. The Agent chooses product-visible models and maps them to internal routes on the server.

## Data Contracts

### Creator-facing source

```ts
type SkillSource = {
  name: string;
  summary: string;
  usageScenarios: string;
  inputs: string;
  method: string;
  outputs: string;
  askWhen: string;
  modality: "image" | "video";
};
```

### Internal normalized projection

```ts
type NormalizedSkill = {
  version: 1;
  modality: "image" | "video";
  inputHints: Array<{ key: string; label: string; required: boolean; kind: "asset" | "text" | "choice" | "number" }>;
  methodSteps: Array<{ id: string; instruction: string; action: "analyze" | "canvas" | "image" | "video" | "review" | "deliver" }>;
  approvalRules: { beforeCreditRun: true; beforeBatch: boolean; beforeOverwrite: boolean; beforeDelivery: boolean };
  deliveryChecks: string[];
};
```

The normalized projection is advisory. Every proposed operation still passes the existing server-side Agent policy, workflow preflight, tenant checks, pricing checks, and asset rules.

## Persistence

Add tenant-scoped Skill records with immutable versions:

- `agent_skills`: identity, visibility (`official` or `private`), owner, current published version, archive status.
- `agent_skill_versions`: source JSON, normalized JSON, source checksum, version number, draft/published/archived status, creator, timestamps.
- `agent_skill_runs`: selected version snapshot, session/turn/flow/project links, status, budget snapshot, delivery result.
- `agent_skill_step_runs`: ordered step status, approval status, tool-call/workflow/node/asset links, retry count, error summary.

Official Skills are platform-scoped and immutable after publication. Private Skills are tenant/user scoped and can be edited by their owner. Run records always reference an immutable version snapshot.

## API Surface

Creator APIs:

```txt
GET    /api/v2/agent/skills?scope=available|mine
POST   /api/v2/agent/skills/drafts
GET    /api/v2/agent/skills/:skillId
PATCH  /api/v2/agent/skills/:skillId/draft
POST   /api/v2/agent/skills/:skillId/publish
POST   /api/v2/agent/skills/:skillId/duplicate
POST   /api/v2/agent/skills/authoring/turn
POST   /api/v2/agent/skill-runs
GET    /api/v2/agent/skill-runs/:runId
GET    /api/v2/agent/skill-runs/:runId/events
POST   /api/v2/agent/skill-runs/:runId/approve
POST   /api/v2/agent/skill-runs/:runId/cancel
```

All endpoints require v2 auth and tenant/project/flow authorization. Public responses contain product model names and friendly route labels only. They never contain provider names, credentials, base URLs, raw route keys, upstream model names, signed URLs, or internal object keys.

## Agent Behavior

The planner receives the selected Skill source and normalized hints as untrusted user-authored context, not as higher-priority instructions. It must return strict JSON containing:

- user-facing reply;
- missing questions, if any;
- evidence summaries;
- proposed canvas operations;
- proposed Skill steps and tool calls;
- user-visible model/parameter choices;
- cost estimate when any paid action is proposed;
- approval requirements;
- delivery checks.

The planner may read automatically. It may create safe draft nodes after policy validation. It must pause for credit-consuming generation, batch generation, overwrite/delete, and final delivery unless the user explicitly approved the Skill run budget and policy for the current run.

## Error and Recovery Rules

- Missing required Skill input: ask a focused question; do not guess.
- Invalid Skill source or normalized projection: keep the draft, show validation errors, do not publish.
- Invalid LLM output: perform one bounded repair attempt, then fail closed.
- Missing pricing or inactive model route: return a stable error and do not enqueue work.
- Provider/workflow failure: existing refund/release path runs; Skill step is retryable with the same version snapshot.
- Canvas draft conflict: reload once, revalidate operations, then show a conflict without silently overwriting.
- Browser refresh/disconnect: database events and run records remain the source of truth; UI replays by sequence.

## Security and Billing

Skill source and Agent text are user content and may contain prompt-injection text. The planner prompt must explicitly separate system policy from Skill/user content. Server policy validates every operation. Credit reservations happen only in the existing workflow/billing service, with idempotency keys at Skill run, step, and workflow levels. Generated media is stored as `assetId`; no base64, data URL, blob URL, signed URL, or File object is persisted in drafts or Skill records.

## Release Boundary

Release 1 includes:

1. Skill persistence, private/official visibility, immutable versions.
2. LibTV-style conversational authoring and editable drafts.
3. Skill picker and detail view inside the canvas Agent panel.
4. Skill-aware Agent planning with focused questions.
5. Image and video tools using existing workflow/worker/AI Gateway paths.
6. Key-step approval, task events, delivery checks, asset persistence, and canvas write-back.
7. Seeded official Skills for product image, product short video, travel video, image variations, and image-to-video.

Deferred: public marketplace, ratings, sharing, multi-agent roles, memory, arbitrary uploaded code, and user-defined external tools.

## Acceptance Criteria

- A user can open a project canvas, select an official Skill, and see the Agent acknowledge the Skill and current canvas context.
- A user can create and save a private Skill through conversation without writing JSON or code.
- A Skill run asks only for missing required inputs, proposes a visible plan, and pauses before paid generation.
- Confirmed image/video tasks create durable Agent step records, workflow runs, assets, and canvas-linked result nodes.
- Failed tasks refund/release credits and can be retried from the same Skill version.
- Refreshing the page replays the Skill run timeline and preserves the selected Skill/version.
- No creator-facing response or persisted graph contains provider secrets or internal route data.
