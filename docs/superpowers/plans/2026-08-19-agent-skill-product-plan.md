# TapFlow Agent + Skill Product Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a canvas-first Agent + Skill product that matches the user-facing LibTV Skill model for text, image, and video creation while reusing TapFlow's v2 canvas, workflow, AI Gateway, asset, worker, and billing infrastructure.

**Architecture:** One V2 Agent turn loop orchestrates scoped canvas work through native tool calls and streamed events. Skills are human-readable, versioned creation guides that the loop loads as untrusted context; they may supply a validated declarative subgraph template but never code or provider configuration. The legacy planner/executor remains isolated behind flags until V2 has passed staging acceptance. Skill runs and steps are durable, replayable, tenant-scoped, and bound to immutable Skill versions.

**Tech Stack:** Vite + React, `@xyflow/react`, Fastify API, PostgreSQL migrations/RLS, Redis/BullMQ, existing `packages/ai-gateway-core`, existing asset/object-storage and billing services, Zod, Vitest.

---

## Workstream A: V2 Agent Runtime Foundation

### Task 1: Freeze baseline and feature flags

**Files:**
- Modify: `apps/api/src/config/env.ts`
- Modify: `docker-compose.staging.yml`
- Modify: `docs/STAGING_ENV_TEMPLATE.md`
- Modify: `PROJECT_RECORD.md`
- Test: `apps/api/test/agent-skill-config.test.ts`

- [ ] Add server flags with disabled production-safe defaults: `AGENT_V2_ENABLED`, `AGENT_V2_RUNTIME_ENABLED`, `AGENT_SKILLS_ENABLED`, `AGENT_SKILL_AUTHORING_ENABLED`, `AGENT_SKILL_RUNTIME_ENABLED`, `AGENT_SKILL_MAX_SOURCE_CHARS=24000`, `AGENT_SKILL_MAX_STEPS=12`, and `AGENT_SKILL_REPAIR_ATTEMPTS=1`.
- [ ] Add `VITE_AGENT_V2_ENABLED`, `VITE_AGENT_SKILLS_ENABLED`, `VITE_AGENT_SKILL_AUTHORING_ENABLED`, and `VITE_AGENT_SKILL_RUNTIME_ENABLED`; do not infer enablement from `import.meta.env.DEV`.
- [ ] Define rollout precedence: V2 panel requires both matching Vite/server V2 flags; authoring requires Skill flags; any disabled runtime flag renders the current Agent panel and rejects V2 write routes.
- [ ] Write config tests that reject non-positive limits and confirm all flags default to disabled.
- [ ] Run `npm run test --workspace @aigc-flow/api -- agent-skill-config` and record the result in the project record.
- [ ] Commit as `feat(agent): add v2 agent and skill feature flags`.

### Task 2: Add V2 turn metadata, leases, and replay safety

**Files:**
- Create: `packages/db/migrations/000075_agent_v2_metadata.sql`
- Modify: `apps/api/src/modules/agent/agent-session.repository.ts`
- Modify: `apps/api/src/modules/agent/agent-event.service.ts`
- Test: `packages/db/test/agent-v2-metadata.test.ts`
- Test: `apps/api/test/agent-v2-replay.test.ts`

- [ ] Add `agent_version`, `graph_revision`, `idempotency_key`, `cancelled_at`, and a bounded turn lease to `agent_turns`; add V2 namespace/version, graph revision, and idempotency fields to `agent_tool_calls`, `agent_tasks`, and `agent_task_events` without changing legacy values.
- [ ] Add tenant-scoped unique indexes that deduplicate V2 turn requests and tool calls by their idempotency keys while allowing historical legacy records with null V2 metadata.
- [ ] Make every V2 event append through the existing monotonic session sequence and include turn, task, tool-call, Skill version, graph revision, and redaction version metadata.
- [ ] Implement acquire/renew/release lease behavior so one V2 turn cannot execute twice after refresh, retry, or a second browser tab; cancellation is durable and blocks later tool mutations.
- [ ] Test migration/RLS, duplicate idempotency, lease contention, cancellation, and `afterSeq` event replay without modifying old sessions.
- [ ] Run `npm run build --workspace @aigc-flow/db` and focused API tests; report database-dependent skips when `DATABASE_URL` is absent.
- [ ] Commit as `feat(agent): add v2 turn metadata and replay guards`.

### Task 3: Add native tool-calling and text-streaming gateway contracts

**Files:**
- Create: `packages/ai-gateway-core/src/text-streaming-contract.ts`
- Modify: `packages/ai-gateway-core/src/types.ts`
- Modify: `packages/ai-gateway-core/src/provider-adapter.ts`
- Modify: `packages/ai-gateway-core/src/ai-gateway.ts`
- Modify: `packages/ai-gateway-core/src/database-text-runtime.ts`
- Modify: `packages/ai-gateway-core/src/openai-compatible-text-adapter.ts`
- Modify: `packages/ai-gateway-core/src/aittco-text-relay-adapter.ts`
- Test: `packages/ai-gateway-core/test/text-streaming-contract.test.ts`
- Test: `packages/ai-gateway-core/test/database-text-runtime.test.ts`

- [ ] Define `streamText` events for text deltas, tool-call deltas, completed tool calls, usage, provider errors, and cancellation; support incremental JSON tool arguments without exposing provider frames to the browser.
- [ ] Add route capability checks `supportsTextStreaming` and `supportsToolCalling`; the V2 Agent must return `AGENT_ROUTE_CAPABILITY_REQUIRED` when either is unavailable instead of parsing tool JSON from model text.
- [ ] Preserve the existing synchronous text-generation contract for canvas text nodes; the new streaming contract is only the V2 Agent-control plane.
- [ ] Resolve routes and decrypt credentials only inside `DatabaseTextGenerationRuntime`; redact call logs and emit product-visible model/route labels only.
- [ ] Test OpenAI-compatible and relay delta streams, split tool arguments, usage, provider errors, cancellation, redaction, and capability fail-closed behavior.
- [ ] Run `npm run test --workspace @aigc-flow/ai-gateway-core` and `npm run build --workspace @aigc-flow/ai-gateway-core`.
- [ ] Commit as `feat(ai-gateway): add native agent tool streaming`.

### Task 4: Build scoped, sanitized V2 Agent context

**Files:**
- Create: `apps/api/src/modules/agent/agent-catalog-context.ts`
- Create: `apps/api/src/modules/agent/agent-run-history-context.ts`
- Modify: `apps/api/src/modules/agent/agent-context-builder.ts`
- Modify: `apps/api/src/modules/agent/agent-redaction.ts`
- Modify: `apps/api/src/modules/agent/agent-reference-context.ts`
- Test: `apps/api/test/agent-v2-context.test.ts`

- [ ] Build the context from only explicit selection, viewport neighborhood, and necessary upstream/downstream summaries; represent assets by safe IDs and labels, not signed URLs or binary data.
- [ ] Project a product-visible model catalog with display name, supported media capabilities, active availability, parameter labels, and estimated price ranges. Exclude provider, base URL, credential, upstream model, and raw route key.
- [ ] Add recent agent/workflow result summaries plus `contextScope`, `graphRevision`, `capabilityScope`, and `redactionVersion` to make a V2 turn auditable and replayable.
- [ ] Treat Skill text, canvas text, asset labels, and historical output as delimiter-separated untrusted data; no user content can introduce a tool or expand the selected flow scope.
- [ ] Test empty/selective/viewport contexts, inactive routes, missing pricing, injected text, sensitive-field scans, and context-size limits.
- [ ] Run `npm run test --workspace @aigc-flow/api -- agent-v2-context` and `npm run build --workspace @aigc-flow/api`.
- [ ] Commit as `feat(agent): add scoped v2 agent context`.

## Workstream B: Skill Foundation

### Task 5: Add versioned Skill persistence with tenant isolation

**Files:**
- Create: `packages/db/migrations/000076_agent_skills.sql`
- Create: `packages/db/src/agent-skills.ts`
- Test: `packages/db/test/agent-skills.test.ts`

- [ ] Create `agent_skills` with `tenant_id`, `owner_user_id`, `visibility`, `status`, `slug`, `name`, `summary`, `modality`, `current_version_id`, and audit timestamps. Enforce private uniqueness on `(tenant_id, slug)`.
- [ ] Create `agent_skill_versions` with `tenant_id`, `skill_id`, `version_no`, `source_json`, `source_markdown`, `frontmatter_json`, `normalized_json`, optional `graph_json`/package object key, `source_checksum`, `status`, `created_by`, and immutable timestamps.
- [ ] Create `agent_skill_runs` with tenant/session/turn/project/flow links, immutable `skill_version_id`, status, approval state, budget snapshot, graph revision, idempotency key, output JSON, and error JSON.
- [ ] Create `agent_skill_step_runs` with tenant/run/step index, action, status, approval, tool/workflow/node/asset links, retry count, output JSON, and error JSON.
- [ ] Add tenant indexes and RLS policies following existing tenant-context helpers. Official platform-scoped records must use the established platform scope; creator private records require matching tenant and owner permissions.
- [ ] Prevent updates to published versions and require positive version numbers.
- [ ] Add repository functions for list, draft creation/update, publish, duplicate, run creation, step creation/update, and event metadata.
- [ ] Test tenant isolation, private/official visibility, immutable publication, duplicate numbering, and run snapshot references.
- [ ] Run `npm run build --workspace @aigc-flow/db`; report database-dependent skips when `DATABASE_URL` is absent.
- [ ] Commit as `feat(agent): persist versioned skills and skill runs`.

### Task 6: Define source, normalized, and package Skill contracts

**Files:**
- Create: `apps/api/src/modules/agent/skill-types.ts`
- Create: `apps/api/src/modules/agent/skill-schemas.ts`
- Create: `apps/api/src/modules/agent/skill-normalizer.ts`
- Create: `packages/workflow-core/src/skill-md.ts`
- Create: `src/flowCanvas/agent/skillTypes.ts`
- Test: `apps/api/test/agent-skill-normalizer.test.ts`
- Test: `packages/workflow-core/test/skill-md.test.ts`

- [ ] Define creator-facing `SkillSource`: `name`, `summary`, `usageScenarios`, `inputs`, `method`, `outputs`, `askWhen`, `category`, and `modality` (`text`, `image`, or `video`). Keep category/triggers optional in the UI but normalized in the package manifest.
- [ ] Define internal `NormalizedSkill` version 1: bounded input hints, method actions (`analyze`, `canvas`, `text`, `image`, `video`, `review`, `deliver`), approval rules, delivery checks, and optional template input bindings.
- [ ] Reject empty required fields, source over `AGENT_SKILL_MAX_SOURCE_CHARS`, more than 12 steps, unsupported modalities, and overlong delivery checks.
- [ ] Normalize whitespace/headings and produce a canonical checksum without adding creative instructions.
- [ ] Add a pure `SKILL.md` parser/serializer with YAML frontmatter for name, description, modality, category, triggers, inputs, outputs, approval policy, and graph schema version. The form UI remains the source authoring experience; YAML is import/export only.
- [ ] Define the optional `graph.json` package manifest: allowlisted current canvas node kinds, serializable defaults, declared input bindings, and valid edges only. Reject script/executable files, URLs, base64/blob/data URLs, raw route/provider/credential fields, arbitrary actions, and unknown node data on import, publish, and instantiation.
- [ ] Test valid text/image/video sources, invalid fields, deterministic checksums, duplicate bullets, and prompt-injection text treated as data.
- [ ] Test frontmatter round trips, path traversal, malformed UTF-8, unsafe package fields, unknown node kinds, invalid bindings, and stable package checksums.
- [ ] Run focused API tests and `npm run build --workspace @aigc-flow/api`.
- [ ] Commit as `feat(agent): define skill source and normalized contracts`.

### Task 7: Seed the official Skill catalog

**Files:**
- Create: `apps/api/src/modules/agent/official-skills.ts`
- Create: `scripts/dev-seed-agent-skills.ts`
- Modify: `package.json`
- Test: `apps/api/test/official-agent-skills.test.ts`

- [ ] Add provider-agnostic official Skills: concept short-video scripts, ad copy/storyboards, product image direction, image variations, product short video, travel video, and image-to-video.
- [ ] Keep each Skill expressed in user-facing creative language; do not include provider names, route keys, credentials, or API instructions.
- [ ] Make seeding idempotent by stable slug and checksum; never overwrite private Skills.
- [ ] Guard the script for local/dev or explicitly approved staging use.
- [ ] Test catalog validation, stable slugs, idempotent seed input, and secret/internal-field absence.
- [ ] Commit as `feat(agent): add official text image and video skills`.

## Workstream C: Authoring and Management

### Task 8: Implement Skill management API and package import/export

**Files:**
- Create: `apps/api/src/modules/agent/skill.repository.ts`
- Create: `apps/api/src/modules/agent/skill.service.ts`
- Create: `apps/api/src/modules/agent/skill-package.service.ts`
- Create: `apps/api/src/modules/agent/skill.routes.ts`
- Create: `apps/api/src/modules/agent/skill.schemas.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/agent-skills-api.test.ts`

- [ ] Implement `GET /api/v2/agent/skills?scope=available|mine` with safe preview fields and modality/category/search filters.
- [ ] Implement `POST /api/v2/agent/skills/import` and `GET /api/v2/agent/skills/:skillId/export`. Accept only a size-bounded package containing `SKILL.md`, optional `graph.json`, and allowlisted references/assets; reject traversal, symlinks, scripts, executable files, and unsupported package files before object-storage write.
- [ ] Implement `POST /api/v2/agent/skills/drafts`, `GET /api/v2/agent/skills/:skillId`, and `PATCH /api/v2/agent/skills/:skillId/draft` with tenant/owner checks.
- [ ] Implement `POST /api/v2/agent/skills/:skillId/publish`; validate source and normalized projection before creating immutable version.
- [ ] Implement `POST /api/v2/agent/skills/:skillId/duplicate` for private copies of official or owned Skills.
- [ ] Map errors to `SKILL_NOT_FOUND`, `SKILL_FORBIDDEN`, `SKILL_INVALID_SOURCE`, `SKILL_VERSION_CONFLICT`, and `SKILL_PUBLISH_BLOCKED`.
- [ ] Test auth, tenant isolation, ownership, duplicate, publish immutability, stale revision, import/export round trips, package rejection, and response redaction.
- [ ] Run API build and focused tests.
- [ ] Commit as `feat(agent): add skill management api`.

### Task 9: Add conversational Skill authoring

**Files:**
- Create: `apps/api/src/modules/agent/skill-authoring.service.ts`
- Create: `apps/api/src/modules/agent/skill-authoring-prompt.ts`
- Create: `apps/api/src/modules/agent/skill-authoring-parser.ts`
- Modify: `apps/api/src/modules/agent/agent.routes.ts`
- Modify: `apps/api/src/modules/agent/agent.service.ts`
- Test: `apps/api/test/agent-skill-authoring.test.ts`

- [ ] Implement `POST /api/v2/agent/skills/authoring/turn` accepting draft source, user message, sanitized canvas snapshot, and optional session ID.
- [ ] Require strict JSON: `assistantReply`, `sourcePatch`, `missingQuestions`, `readyToPreview`, and `validationNotes`.
- [ ] Keep user text, existing Skill source, canvas text, and asset labels below system policy as untrusted content.
- [ ] Allow one bounded repair retry; fail closed with `SKILL_AUTHORING_INVALID_OUTPUT` after a second invalid response.
- [ ] Ensure authoring has no side effects: no node writes, workflow enqueue, or credit reservation.
- [ ] Test complete one-turn authoring, a missing-input follow-up, fenced JSON repair, forbidden internal fields, and no side effects.
- [ ] Commit as `feat(agent): add conversational skill authoring`.

### Task 10: Build the V2 canvas Skill picker and authoring UI

**Files:**
- Create: `src/flowCanvas/agent/v2/CanvasAgentCopilotShell.tsx`
- Create: `src/flowCanvas/agent/v2/useCanvasAgentSessionV2.ts`
- Create: `src/flowCanvas/agent/CanvasAgentSkillPicker.tsx`
- Create: `src/flowCanvas/agent/CanvasAgentSkillDetail.tsx`
- Create: `src/flowCanvas/agent/CanvasAgentSkillAuthoring.tsx`
- Create: `src/flowCanvas/agent/skillApi.ts`
- Modify: `src/flowCanvas/agent/CanvasAgentPanel.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentWorkspaceShell.tsx`
- Modify: `src/flowCanvas/hooks/useRemoteFlowAutosave.ts`
- Test: `src/flowCanvas/agent/CanvasAgentSkillPicker.test.tsx`
- Test: `src/flowCanvas/agent/CanvasAgentSkillAuthoring.test.tsx`

- [ ] Add the Skill entry inside the V2 right-side Agent panel; keep the existing panel as a flag-controlled fallback and do not create another application shell.
- [ ] Build the V2 panel as a single timeline for message, scoped reference, Skill, visible plan, approval, running task, result, and recovery events. History/log/connection views become secondary drawers rather than primary work tabs.
- [ ] Show official/private tabs, search, text/image/video filter, Skill cards, detail view, and “use in this conversation”.
- [ ] Display only LibTV-style fields: summary, usage, inputs, method, outputs, ask-when, modality, version, and visibility.
- [ ] Add conversational “创建 Skill”; show the generated draft as editable fields with preview, save, and discard actions.
- [ ] Persist only Skill ID/version in session state and include it in the next V2 Agent turn; import/export remains an advanced overflow action, not the creator's primary authoring surface.
- [ ] Implement `useCanvasAgentSessionV2` with only `sendPrompt`, `cancelTurn`, `approve`, `selectSkill`, `hydrateReplayEvents`, session/event state, pending question, and pending approval. Remove no behavior from the old session hook in this task.
- [ ] Pause client autosave while applying a server-confirmed Agent draft/revision and resume only after the store accepts the returned revision, so a stale client snapshot cannot overwrite a V2 canvas operation.
- [ ] Use existing menu tokens, outside-click dismissal, keyboard focus, and no native `<select>`.
- [ ] Test filtering, selection, detail close, draft editing, validation errors, version display, and clearing selection.
- [ ] Run focused frontend tests and `npm run build`.
- [ ] Commit as `feat(agent): add canvas skill picker and authoring ui`.

## Workstream D: Canvas-first V2 Agent + Skill Runtime

### Task 11: Implement the single V2 Agent turn loop and canvas-only tools

**Files:**
- Create: `apps/api/src/modules/agent/skill-context-builder.ts`
- Create: `apps/api/src/modules/agent/v2/agent-turn-loop.ts`
- Create: `apps/api/src/modules/agent/v2/agent-v2-tools.ts`
- Create: `apps/api/src/modules/agent/v2/agent-v2-prompt.ts`
- Create: `apps/api/src/modules/agent/v2/agent-v2-events.ts`
- Modify: `apps/api/src/modules/agent/agent.routes.ts`
- Modify: `apps/api/src/modules/agent/agent.schemas.ts`
- Modify: `apps/api/src/modules/agent/agent-canvas.service.ts`
- Modify: `apps/api/src/modules/agent/agent-tool-policy.ts`
- Modify: `src/flowCanvas/agent/canvasAgentApi.ts`
- Test: `apps/api/test/agent-v2-turn-loop.test.ts`
- Test: `apps/api/test/agent-v2-tools.test.ts`

- [ ] Add V2 stream and approval endpoints alongside legacy routes: `POST /sessions/:sessionId/turns/v2/stream`, `POST /sessions/:sessionId/approvals/:approvalId/stream`, and `POST /sessions/:sessionId/cancel`. Require V2 flags, v2 auth, flow/project authorization, an idempotency key, expected graph revision, and optional `{ skillId, skillVersion }`.
- [ ] Implement one loop: build scoped context -> load immutable Skill -> stream native tool calls -> validate/execute a canvas-only tool -> append durable event -> continue or finish. Do not invoke the old planner, executor, offline planner, or JSON-in-text parser from V2.
- [ ] Register only `canvas.get_context`, `skill.load`, `canvas.apply_ops`, `canvas.run_nodes`, `canvas.await_results`, `ask_user`, and `finish`. Define strict discriminated Zod schemas and server-owned execution context for every tool.
- [ ] Implement `canvas.apply_ops` using an allowlisted patch surface and `expectedRevision` CAS. Create visible plan/provisional/result nodes only; the server rereads the current flow draft before mutation and rejects stale or unsafe operations without a silent overwrite.
- [ ] Implement `canvas.run_nodes` as an adapter to the existing Workflow Run, Worker, reserve/settle/refund, and idempotency path. Do not register independent `generate_image`, `generate_image_batch`, `edit_image`, or arbitrary provider tools in V2.
- [ ] Include selected Skill source and normalized hints in explicit untrusted-content delimiters and progressively load only the permitted package reference excerpts. Test official/private access, native multi-tool sequence, unsupported capability, injection text, no-Skill turns, stale revisions, and duplicate V2 requests.
- [ ] Run API tests and frontend type/build checks.
- [ ] Commit as `feat(agent): add canvas-first v2 turn loop`.

### Task 12: Add durable Skill run and approval state machine

**Files:**
- Create: `apps/api/src/modules/agent/agent-skill-run.service.ts`
- Create: `apps/api/src/modules/agent/agent-skill-policy.ts`
- Modify: `apps/api/src/modules/agent/agent-tool-policy.ts`
- Modify: `apps/api/src/modules/agent/agent-event.service.ts`
- Modify: `apps/api/src/modules/agent/agent-session.repository.ts`
- Modify: `src/flowCanvas/agent/canvasAgentStateMachine.ts`
- Modify: `src/flowCanvas/agent/agentWorkspaceTimeline.ts`
- Test: `apps/api/test/agent-skill-policy.test.ts`
- Test: `src/flowCanvas/agent/agentSkillRunState.test.ts`

- [ ] Define run states: `draft`, `waiting_for_input`, `planned`, `waiting_for_approval`, `running`, `reviewing`, `succeeded`, `partial_success`, `failed`, `cancelled`.
- [ ] Define step states: `pending`, `running`, `waiting_for_approval`, `succeeded`, `failed`, `skipped`, `cancelled`.
- [ ] Allow automatic reads/analyzes and safe draft canvas writes; require approval for credit runs, batches, overwrite/delete, and delivery.
- [ ] Persist every transition with monotonic event sequence, V2 turn/tool idempotency key, expected graph revision, and immutable Skill version ID.
- [ ] Reject unavailable models, inactive routes, missing pricing, unauthorized nodes, and unsafe node patches.
- [ ] Add timeline labels: `读取 Skill`, `理解画布`, `补充信息`, `制定计划`, `等待确认`, `提交生成`, `检查结果`, `回填画布`.
- [ ] Test legal transitions, duplicate approval, cancellation, stale approval, credit policy, and event replay order.
- [ ] Commit as `feat(agent): add durable skill run state machine`.

### Task 13: Execute Skill text/image/video steps through existing tools

**Files:**
- Create: `apps/api/src/modules/agent/tools/skill-step-runner.ts`
- Modify: `apps/api/src/modules/agent/agent-tool-registry.ts`
- Modify: `apps/api/src/modules/agent/agent-tool-runner.ts`
- Modify: `apps/api/src/modules/agent/agent-workflow-launcher.ts`
- Modify: `apps/worker/src/workflow-runtime/service.ts` only for Skill metadata propagation
- Test: `apps/api/test/agent-skill-step-runner.test.ts`
- Test: `apps/worker/test/agent-skill-metadata.test.ts`

- [ ] Map normalized actions to `analyze`, `create_canvas`, `generate_text`, `generate_image`, `generate_video`, `review`, and `deliver`.
- [ ] Implement `generate_text` as a server-authorized text runtime call that writes the result to a text node/output record; do not require an `assets` row for text-only Skills.
- [ ] Keep text generation subject to route availability, pricing, reserve/settle/refund when priced, and the same approval policy as paid image/video generation.
- [ ] Resolve product-visible model choices to internal routes only in the server launcher.
- [ ] Create a Skill step record before every paid workflow and link workflow/node IDs after launch.
- [ ] Reuse existing reserve/settle/refund and idempotency paths; do not create a second billing implementation.
- [ ] Pass only Skill run/step IDs to Worker metadata; never pass credentials or raw provider configuration.
- [ ] When a published Skill has a graph template, instantiate it only through the V2 `canvas.apply_ops` template path: validate the package a third time, map template IDs to new UUIDs, bind declared current inputs by ID, and require separate approval before overwriting any existing result node.
- [ ] Test text-only run, text-to-image/video step chain, image run, video run, partial batch success, provider failure/refund, missing-pricing fail-closed, and retry identity.
- [ ] Run API, Worker, AI Gateway Core, and billing-focused tests.
- [ ] Commit as `feat(agent): execute skill text image and video steps`.

### Task 14: Add delivery checks and canvas/asset write-back

**Files:**
- Create: `apps/api/src/modules/agent/skill-delivery-checks.ts`
- Modify: `apps/api/src/modules/agent/agent-canvas.service.ts`
- Modify: `src/flowCanvas/agent/CanvasAgentResultCard.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentTaskCard.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentCanvasOpsCard.tsx`
- Test: `apps/api/test/agent-skill-delivery.test.ts`
- Test: `src/flowCanvas/agent/CanvasAgentSkillResults.test.tsx`

- [ ] Check required artifact count, text output presence/length/format for text Skills, media modality/duration/aspect metadata when available, asset persistence for media, and result-node links.
- [ ] Mark a run `reviewing` when a result exists but a delivery check is incomplete; never claim completion from text alone.
- [ ] Create text result nodes with bounded text output and safe Skill run/step metadata; create media result nodes with `assetId`; never store URLs/base64/blob data.
- [ ] Show retry, place-on-canvas, continue-from-result, and view-run actions.
- [ ] Test missing asset, wrong modality, partial success, successful delivery, revision conflict, and failed-step retry.
- [ ] Test template plan instantiation, safe text/asset binding, invalid template revalidation, and rejected overwrite attempts.
- [ ] Run focused frontend/API tests and production build.
- [ ] Commit as `feat(agent): verify skill delivery and link canvas results`.

## Workstream E: Release and Verification

### Task 15: Add deployment, seed, observability, coexistence, and rollback documentation

**Files:**
- Modify: `docker-compose.staging.yml`
- Modify: `docs/STAGING_ENV_TEMPLATE.md`
- Modify: `docs/v2-local-development.md`
- Modify: `docs/PRODUCTION_RUNBOOK.md`
- Modify: `docs/staging-runbook.md`
- Modify: `PROJECT_RECORD.md`

- [ ] Document disabled-by-default flags and the rollout order: deploy V2 code/migrations with all V2 flags off -> enable V2 for an internal tenant -> enable authoring -> enable runtime for a canary tenant -> staging acceptance -> controlled production expansion.
- [ ] Document coexistence: `agent_version` is written for every turn, legacy sessions are not force-migrated, and old/V2 runtimes cannot execute one turn concurrently. The V2 UI falls back to the old panel when its flag is off.
- [ ] Document rollback by disabling `AGENT_V2_RUNTIME_ENABLED` first, then `AGENT_SKILL_RUNTIME_ENABLED`; stop the worker before schema rollback only when explicitly required. Preserve Skill/version/run rows, generated Assets, flow drafts, and immutable billing ledger records.
- [ ] Document production migrations with `node packages/db/dist/cli.js`.
- [ ] Add observability fields for Skill ID/version, run duration, first-event latency, failed step, retry count, and redaction hits; keep provider internals out of creator-facing logs.
- [ ] Update `PROJECT_RECORD.md` with migration, seed, flags, and smoke-test status.
- [ ] Commit as `docs(agent): document skill runtime deployment and rollback`.

### Task 16: Run contract, UI, security, and end-to-end acceptance

**Files:**
- Create: `apps/api/test/agent-skill-e2e.contract.test.ts`
- Create: `src/flowCanvas/agent/CanvasAgentSkillIntegration.test.tsx`
- Modify: `docs/CODEX_HANDOFF.md`
- Modify: `PROJECT_RECORD.md`

- [ ] Run: open project -> select official text Skill -> provide a topic -> Agent asks for missing audience/length -> plan appears -> approve paid text generation when priced -> text node appears -> refresh -> timeline replay.
- [ ] Run: open project -> select official image/video Skill -> attach current canvas image -> Agent asks for missing duration -> plan appears -> model/size changes update estimate -> approval -> image/video task -> asset -> result node -> refresh -> timeline replay.
- [ ] Run private authoring: describe Skill -> answer one question -> preview -> edit method/output -> save -> select -> run.
- [ ] Run package path: import a valid `SKILL.md` package with a declarative template -> review in the normal LibTV-style detail UI -> publish -> instantiate a plan on the selected canvas -> export without secrets or signed URLs.
- [ ] Run failures: unavailable native-tool/stream route, invalid authoring structured output, missing pricing, insufficient credits, provider failure/refund, canvas conflict, event disconnect, cancellation, duplicate idempotency key, and stale approval.
- [ ] Scan API responses, events, drafts, and screenshots for `apiKey`, `Authorization`, `baseUrl`, provider internals, raw route keys, signed URLs, data URLs, blob URLs, and base64 media.
- [ ] Run `npm run build`, `npm test`, `npm run test --workspace @aigc-flow/api`, `npm run test --workspace @aigc-flow/worker`, `npm run test --workspace @aigc-flow/ai-gateway-core`, and `npm run test --workspace @aigc-flow/db`; record exact infrastructure-dependent skips and historical failures.
- [ ] Update `docs/CODEX_HANDOFF.md` and `PROJECT_RECORD.md` with completed phases, deployment flags, and known follow-ups.
- [ ] Commit as `test(agent): verify canvas-first skill production flow`.

## Deferred Work

Do not start until Task 16 passes in staging: public Skill marketplace, sharing/ratings/moderation, multi-agent roles, long-term memory, arbitrary uploaded Skill code, external tools, audio/3D execution, and autonomous budget loops.

## Execution Order

1. Tasks 1-4: flags, V2 persistence/replay safety, native gateway tools, scoped context.
2. Tasks 5-7: versioned Skill persistence, package contracts, official catalog.
3. Tasks 8-10: APIs, conversational authoring, and LibTV-style V2 canvas UI.
4. Tasks 11-14: V2 turn loop, approvals, text/image/video execution, template instantiation, and delivery.
5. Tasks 15-16: coexistence rollout, observability, security, staging acceptance, and handoff.

Production flags remain disabled until Task 16 passes in staging. Each task should be committed separately and leave the repository buildable.
