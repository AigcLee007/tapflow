# TapFlow Agent + Skill Product Design

## Scope

TapFlow keeps the canvas as the primary workspace and rebuilds the Agent + Skill product layer around it. The first release adopts the user-facing behavior shown in LibTV: a Skill is a short, human-readable professional creation guide; the Agent loads that guide, combines it with the current canvas and available platform capabilities, and plans an executable task. The new path is one canvas-first V2 Agent turn loop, not another planner/executor fallback chain; the existing Agent remains a feature-flagged fallback until V2 completes staging acceptance.

The first release supports official Skills and private user Skills, text, image, and video creation, conversational Skill authoring, editable Skill drafts, key-step approval, text-node and asset-backed outputs, and canvas write-back. It does not include a public Skill marketplace, ratings, author profiles, multi-agent role orchestration, or long-term memory.

## Product Model

```text
Canvas = primary workspace and durable visual state
Agent = context-aware planner and task orchestrator
Skill = reusable professional creation guide
Tools = constrained platform actions
Worker = asynchronous provider execution
Assets = durable media outputs
Billing = server-authoritative reserve/settle/refund
V2 Agent turn loop = native tool-calling orchestration bound to one flow
```

Skill authoring is intentionally simple. A user can say "create a travel-video Skill" and the Agent drafts:

- name and one-line description;
- usage scenarios;
- required and optional inputs;
- recommended creation method;
- expected outputs;
- conditions that require a follow-up question;
- modality: text, image, or video. A video Skill may require image inputs, and image/video Skills may include text-generation steps.

The user edits these fields as natural language and saves a private Skill. Internally, the API compiles the source into a validated normalized projection used for policy checks and execution planning. The normalized projection is never required in the creator-facing UI.

## Runtime Flow

```text
User selects a Skill or sends a canvas request
  -> V2 Agent reads a scoped, sanitized canvas context
  -> V2 Agent loads the immutable selected Skill version when present
  -> Agent calls only canvas-bound tools to ask a question, create a visible plan subgraph, or launch a node
  -> User approves credit-consuming, batch, overwrite, and delivery actions
  -> Existing Canvas Ops, workflow runs, Worker, AI Gateway, billing, and assets execute the approved node work
  -> Agent observes durable events, checks delivery requirements, and incrementally writes results back to the same flow
```

Skill text is guidance, not executable code. It cannot select provider credentials, expose route internals, bypass billing, write arbitrary node data, or call external URLs. The Agent chooses product-visible models and maps them to internal routes on the server. Every V2 call has a session, turn, graph revision, and idempotency key. A tool cannot act outside the current project/flow.

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
  modality: "text" | "image" | "video";
};
```

### Internal normalized projection

```ts
type NormalizedSkill = {
  version: 1;
  modality: "text" | "image" | "video";
  inputHints: Array<{ key: string; label: string; required: boolean; kind: "asset" | "text" | "choice" | "number" }>;
  methodSteps: Array<{ id: string; instruction: string; action: "analyze" | "canvas" | "text" | "image" | "video" | "review" | "deliver" }>;
  approvalRules: { beforeCreditRun: true; beforeBatch: boolean; beforeOverwrite: boolean; beforeDelivery: boolean };
  deliveryChecks: string[];
};
```

The normalized projection is advisory. Every proposed operation still passes the existing server-side Agent policy, workflow preflight, tenant checks, pricing checks, and asset rules.

### Internal package and graph-template protocol

The creator UI continues to use the LibTV-style fields above. `SKILL.md` is an internal export/import and official-catalog protocol, not a format ordinary creators must write. A package may contain:

```text
my-skill/
  SKILL.md                 # YAML frontmatter plus creator-readable method
  graph.json               # optional declarative canvas subgraph template
  references/              # optional, explicitly referenced supporting material
  assets/                  # optional preview/cover assets
```

The `SKILL.md` frontmatter contains only public metadata: name, description, modality, category, triggers, inputs, outputs, approval policy, and graph schema version. Import/export derives it from the creator-facing source and stores the frontmatter, markdown, normalized projection, manifest, and checksum in the immutable Skill version.

`graph.json` is an optional non-executable template. It is validated on import, publish, and instantiation. It may use only current allowlisted node kinds, serializable default parameters, declared input bindings, and valid edges. It must reject provider/route/credential fields, scripts, URLs, base64/blob/data URLs, actions, File objects, and unknown node data. Instantiation assigns new node IDs, binds current assets/text by ID, uses flow-revision CAS, and never overwrites an existing result without a separate user approval.

## Persistence

Add tenant-scoped Skill records with immutable versions:

- `agent_skills`: identity, visibility (`official` or `private`), owner, current published version, archive status.
- `agent_skill_versions`: source JSON, creator-readable markdown/frontmatter, normalized JSON, optional graph manifest/object reference, source checksum, version number, draft/published/archived status, creator, timestamps.
- `agent_skill_runs`: selected immutable version snapshot, session/turn/flow/project links, status, budget snapshot, graph revision, delivery result, and idempotency key.
- `agent_skill_step_runs`: ordered step status, approval status, tool-call/workflow/node/asset links, retry count, error summary.

Official Skills are platform-scoped and immutable after publication. Private Skills are tenant/user scoped and can be edited by their owner. Run records always reference an immutable version snapshot.

## API Surface

Creator APIs:

```txt
GET    /api/v2/agent/skills?scope=available|mine
POST   /api/v2/agent/skills/import
GET    /api/v2/agent/skills/:skillId/export
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

The V2 Agent receives the selected Skill source and normalized hints as untrusted user-authored context, not as higher-priority instructions. It uses native tool calling and streaming text where the selected route declares both capabilities. It must fail closed if those capabilities are absent; V2 must not silently parse tool calls from model text or use JSON-repair fallbacks.

The V2 tool surface is intentionally small:

- `canvas.get_context`: refresh scoped canvas facts and revision;
- `skill.load`: load the selected immutable version and requested safe reference excerpts;
- `canvas.apply_ops`: create/update only allowlisted canvas plan/result nodes with expected-revision CAS;
- `canvas.run_nodes`: submit existing canvas nodes through the existing workflow/billing path;
- `canvas.await_results`: observe durable task/workflow results without re-submitting work;
- `ask_user`: request a missing input or approval;
- `finish`: return an evidence-backed turn result.

All tool inputs use strict discriminated Zod schemas. The server validates the current draft, tenant/project/flow ownership, model availability, pricing, budget, destructive scope, and idempotency before each mutation. There is no arbitrary HTTP, filesystem, code execution, credential access, provider URL, or raw graph JSON tool.

The V2 Agent may read automatically. It may create safe draft/plan nodes after policy validation. It must pause for credit-consuming generation, batch generation, overwrite/delete, and final delivery unless the user explicitly approved the Skill run budget and policy for the current run.

## Error and Recovery Rules

- Missing required Skill input: ask a focused question; do not guess.
- Invalid Skill source or normalized projection: keep the draft, show validation errors, do not publish.
- A route without native tool calling or text streaming: return `AGENT_ROUTE_CAPABILITY_REQUIRED`; V2 never falls back to parsing tool calls from text.
- Invalid authoring structured output: perform one bounded repair attempt, then fail closed.
- Missing pricing or inactive model route: return a stable error and do not enqueue work.
- Provider/workflow failure: existing refund/release path runs; Skill step is retryable with the same version snapshot.
- Canvas draft conflict: reload once, revalidate operations, then show a conflict without silently overwriting.
- Browser refresh/disconnect: database events and run records remain the source of truth; UI replays by sequence.

## Security and Billing

Skill source, package references, Agent text, canvas text, node titles, and asset labels are user content and may contain prompt-injection text. The V2 prompt must explicitly separate system policy from this content. Server policy validates every operation. Credit reservations happen only in the existing workflow/billing service, with idempotency keys at turn, Skill run, step, and workflow levels. Generated media is stored by asset ID; generated text is stored in an authoritative text node/output record. No base64, data URL, blob URL, signed URL, File object, provider name, raw route key, credential, or complete authorization header is persisted in drafts, packages, public events, or creator-facing responses.

## Release Boundary

Release 1 includes:

1. Skill persistence, private/official visibility, immutable versions.
2. LibTV-style conversational authoring and editable drafts.
3. Skill picker and detail view inside the canvas Agent panel.
4. One V2 Agent turn loop with native tool calling, text streaming, focused questions, visible canvas plans, and durable event replay.
5. Text, image, and video execution using existing text/image/video workflow, Worker, and AI Gateway paths.
6. Key-step approval, task events, delivery checks, asset persistence, and canvas write-back.
7. `SKILL.md` package import/export and optional validated canvas templates, with seeded official Skills for concept short-video scripts, ad copy/storyboards, product image, product short video, travel video, image variations, and image-to-video.

Deferred: public marketplace, ratings, sharing, multi-agent roles, memory, arbitrary uploaded code, and user-defined external tools.

## Acceptance Criteria

- A user can open a project canvas, select an official Skill, and see the Agent acknowledge the Skill and current canvas context.
- A user can create and save a private Skill through conversation without writing JSON or code.
- A Skill run asks only for missing required inputs, proposes a visible plan, and pauses before paid generation.
- Confirmed text tasks create durable Agent step records and canvas-linked text outputs; image/video tasks additionally create workflow runs and assets.
- Failed tasks refund/release credits and can be retried from the same Skill version.
- Refreshing the page replays the Skill run timeline and preserves the selected Skill/version.
- A V2 Agent can only mutate the selected project's current flow through the six allowlisted canvas/Skill tools; duplicate turns, stale canvas revisions, and disconnected clients cannot submit a duplicate generation.
- An imported package containing a script, URL, provider field, unsafe node type, or unknown graph field is rejected before storage and again before template instantiation.
- No creator-facing response or persisted graph contains provider secrets or internal route data.
