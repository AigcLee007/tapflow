# TapFlow Agent + Skill Product Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a canvas-first Agent + Skill product that matches the user-facing LibTV Skill model while reusing TapFlow's v2 canvas, workflow, AI Gateway, asset, worker, and billing infrastructure.

**Architecture:** Skills are human-readable, versioned creation guides. The Agent loads a selected Skill into a sanitized planner context, asks for missing information, proposes safe canvas operations and paid tasks, and executes approved work through existing workflow tools. Skill runs and steps are durable, replayable, tenant-scoped, and bound to immutable Skill versions.

**Tech Stack:** Vite + React, `@xyflow/react`, Fastify API, PostgreSQL migrations/RLS, Redis/BullMQ, existing `packages/ai-gateway-core`, existing asset/object-storage and billing services, Zod, Vitest.

---

## Workstream A: Skill Foundation

### Task 1: Freeze baseline and feature flags

**Files:**
- Modify: `apps/api/src/config/env.ts`
- Modify: `docker-compose.staging.yml`
- Modify: `docs/STAGING_ENV_TEMPLATE.md`
- Modify: `PROJECT_RECORD.md`
- Test: `apps/api/test/agent-skill-config.test.ts`

- [ ] Add server flags with disabled production-safe defaults: `AGENT_SKILLS_ENABLED`, `AGENT_SKILL_AUTHORING_ENABLED`, `AGENT_SKILL_RUNTIME_ENABLED`, `AGENT_SKILL_MAX_SOURCE_CHARS=24000`, `AGENT_SKILL_MAX_STEPS=12`, and `AGENT_SKILL_REPAIR_ATTEMPTS=1`.
- [ ] Add `VITE_AGENT_SKILLS_ENABLED`, `VITE_AGENT_SKILL_AUTHORING_ENABLED`, and `VITE_AGENT_SKILL_RUNTIME_ENABLED`; do not infer enablement from `import.meta.env.DEV`.
- [ ] Write config tests that reject non-positive limits and confirm all flags default to disabled.
- [ ] Run `npm run test --workspace @aigc-flow/api -- agent-skill-config` and record the result in the project record.
- [ ] Commit as `feat(agent): add skill runtime feature flags`.

### Task 2: Add versioned Skill persistence with tenant isolation

**Files:**
- Create: `packages/db/migrations/000075_agent_skills.sql`
- Create: `packages/db/src/agent-skills.ts`
- Test: `packages/db/test/agent-skills.test.ts`

- [ ] Create `agent_skills` with `tenant_id`, `owner_user_id`, `visibility`, `status`, `slug`, `name`, `summary`, `modality`, `current_version_id`, and audit timestamps. Enforce private uniqueness on `(tenant_id, slug)`.
- [ ] Create `agent_skill_versions` with `tenant_id`, `skill_id`, `version_no`, `source_json`, `normalized_json`, `source_checksum`, `status`, `created_by`, and immutable timestamps.
- [ ] Create `agent_skill_runs` with tenant/session/turn/project/flow links, immutable `skill_version_id`, status, approval state, budget snapshot, output JSON, and error JSON.
- [ ] Create `agent_skill_step_runs` with tenant/run/step index, action, status, approval, tool/workflow/node/asset links, retry count, output JSON, and error JSON.
- [ ] Add tenant indexes and RLS policies following existing tenant-context helpers. Official platform-scoped records must use the established platform scope; creator private records require matching tenant and owner permissions.
- [ ] Prevent updates to published versions and require positive version numbers.
- [ ] Add repository functions for list, draft creation/update, publish, duplicate, run creation, step creation/update, and event metadata.
- [ ] Test tenant isolation, private/official visibility, immutable publication, duplicate numbering, and run snapshot references.
- [ ] Run `npm run build --workspace @aigc-flow/db`; report database-dependent skips when `DATABASE_URL` is absent.
- [ ] Commit as `feat(agent): persist versioned skills and skill runs`.

### Task 3: Define source and normalized Skill contracts

**Files:**
- Create: `apps/api/src/modules/agent/skill-types.ts`
- Create: `apps/api/src/modules/agent/skill-schemas.ts`
- Create: `apps/api/src/modules/agent/skill-normalizer.ts`
- Create: `src/flowCanvas/agent/skillTypes.ts`
- Test: `apps/api/test/agent-skill-normalizer.test.ts`

- [ ] Define creator-facing `SkillSource`: `name`, `summary`, `usageScenarios`, `inputs`, `method`, `outputs`, `askWhen`, and `modality` (`image` or `video` in Release 1).
- [ ] Define internal `NormalizedSkill` version 1: bounded input hints, method actions (`analyze`, `canvas`, `image`, `video`, `review`, `deliver`), approval rules, and delivery checks.
- [ ] Reject empty required fields, source over `AGENT_SKILL_MAX_SOURCE_CHARS`, more than 12 steps, unsupported modalities, and overlong delivery checks.
- [ ] Normalize whitespace/headings and produce a canonical checksum without adding creative instructions.
- [ ] Test valid image/video sources, invalid fields, deterministic checksums, duplicate bullets, and prompt-injection text treated as data.
- [ ] Run focused API tests and `npm run build --workspace @aigc-flow/api`.
- [ ] Commit as `feat(agent): define skill source and normalized contracts`.

### Task 4: Seed the official Skill catalog

**Files:**
- Create: `apps/api/src/modules/agent/official-skills.ts`
- Create: `scripts/dev-seed-agent-skills.ts`
- Modify: `package.json`
- Test: `apps/api/test/official-agent-skills.test.ts`

- [ ] Add provider-agnostic official Skills: product image direction, image variations, product short video, travel video, and image-to-video.
- [ ] Keep each Skill expressed in user-facing creative language; do not include provider names, route keys, credentials, or API instructions.
- [ ] Make seeding idempotent by stable slug and checksum; never overwrite private Skills.
- [ ] Guard the script for local/dev or explicitly approved staging use.
- [ ] Test catalog validation, stable slugs, idempotent seed input, and secret/internal-field absence.
- [ ] Commit as `feat(agent): add official image and video skills`.

## Workstream B: Authoring and Management

### Task 5: Implement Skill management API

**Files:**
- Create: `apps/api/src/modules/agent/skill.repository.ts`
- Create: `apps/api/src/modules/agent/skill.service.ts`
- Create: `apps/api/src/modules/agent/skill.routes.ts`
- Create: `apps/api/src/modules/agent/skill.schemas.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/test/agent-skills-api.test.ts`

- [ ] Implement `GET /api/v2/agent/skills?scope=available|mine` with safe preview fields.
- [ ] Implement `POST /api/v2/agent/skills/drafts`, `GET /api/v2/agent/skills/:skillId`, and `PATCH /api/v2/agent/skills/:skillId/draft` with tenant/owner checks.
- [ ] Implement `POST /api/v2/agent/skills/:skillId/publish`; validate source and normalized projection before creating immutable version.
- [ ] Implement `POST /api/v2/agent/skills/:skillId/duplicate` for private copies of official or owned Skills.
- [ ] Map errors to `SKILL_NOT_FOUND`, `SKILL_FORBIDDEN`, `SKILL_INVALID_SOURCE`, `SKILL_VERSION_CONFLICT`, and `SKILL_PUBLISH_BLOCKED`.
- [ ] Test auth, tenant isolation, ownership, duplicate, publish immutability, stale revision, and response redaction.
- [ ] Run API build and focused tests.
- [ ] Commit as `feat(agent): add skill management api`.

### Task 6: Add conversational Skill authoring

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

### Task 7: Build the canvas Skill picker and authoring UI

**Files:**
- Create: `src/flowCanvas/agent/CanvasAgentSkillPicker.tsx`
- Create: `src/flowCanvas/agent/CanvasAgentSkillDetail.tsx`
- Create: `src/flowCanvas/agent/CanvasAgentSkillAuthoring.tsx`
- Create: `src/flowCanvas/agent/skillApi.ts`
- Modify: `src/flowCanvas/agent/CanvasAgentPanel.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentWorkspaceShell.tsx`
- Test: `src/flowCanvas/agent/CanvasAgentSkillPicker.test.tsx`
- Test: `src/flowCanvas/agent/CanvasAgentSkillAuthoring.test.tsx`

- [ ] Add the Skill entry inside the existing right-side Agent panel; do not create another application shell.
- [ ] Show official/private tabs, search, image/video filter, Skill cards, detail view, and “use in this conversation”.
- [ ] Display only LibTV-style fields: summary, usage, inputs, method, outputs, ask-when, modality, version, and visibility.
- [ ] Add conversational “创建 Skill”; show the generated draft as editable fields with preview, save, and discard actions.
- [ ] Persist only Skill ID/version in session state and include it in the next Agent turn.
- [ ] Use existing menu tokens, outside-click dismissal, keyboard focus, and no native `<select>`.
- [ ] Test filtering, selection, detail close, draft editing, validation errors, version display, and clearing selection.
- [ ] Run focused frontend tests and `npm run build`.
- [ ] Commit as `feat(agent): add canvas skill picker and authoring ui`.

## Workstream C: Skill-aware Agent Runtime

### Task 8: Load selected Skill into planner context

**Files:**
- Create: `apps/api/src/modules/agent/skill-context-builder.ts`
- Modify: `apps/api/src/modules/agent/agent-context-builder.ts`
- Modify: `apps/api/src/modules/agent/agent-planner-prompt.ts`
- Modify: `apps/api/src/modules/agent/agent.schemas.ts`
- Modify: `src/flowCanvas/agent/canvasAgentApi.ts`
- Test: `apps/api/test/agent-skill-context.test.ts`

- [ ] Extend turn input with optional `{ skillId, skillVersion }` and resolve access server-side.
- [ ] Load the immutable Skill version and include source plus normalized hints in explicit untrusted-content delimiters.
- [ ] Include sanitized canvas, selected assets, visible model catalog, pricing, recent runs, and budget without secrets or internal route data.
- [ ] Add planner output fields `selectedSkill`, `missingQuestions`, `skillPlan`, `approvalRequired`, and `deliveryChecks` while preserving no-Skill compatibility.
- [ ] Test official/private access, stale-version resolution, injection text, redaction, and no-Skill turns.
- [ ] Run API tests and frontend type/build checks.
- [ ] Commit as `feat(agent): load selected skills into planner context`.

### Task 9: Add durable Skill run and approval state machine

**Files:**
- Create: `apps/api/src/modules/agent/agent-skill-run.service.ts`
- Create: `apps/api/src/modules/agent/agent-skill-policy.ts`
- Modify: `apps/api/src/modules/agent/agent-tool-policy.ts`
- Modify: `apps/api/src/modules/agent/agent-event.service.ts`
- Modify: `src/flowCanvas/agent/canvasAgentStateMachine.ts`
- Modify: `src/flowCanvas/agent/agentWorkspaceTimeline.ts`
- Test: `apps/api/test/agent-skill-policy.test.ts`
- Test: `src/flowCanvas/agent/agentSkillRunState.test.ts`

- [ ] Define run states: `draft`, `waiting_for_input`, `planned`, `waiting_for_approval`, `running`, `reviewing`, `succeeded`, `partial_success`, `failed`, `cancelled`.
- [ ] Define step states: `pending`, `running`, `waiting_for_approval`, `succeeded`, `failed`, `skipped`, `cancelled`.
- [ ] Allow automatic reads/analyzes and safe draft canvas writes; require approval for credit runs, batches, overwrite/delete, and delivery.
- [ ] Persist every transition with monotonic event sequence and idempotency key.
- [ ] Reject unavailable models, inactive routes, missing pricing, unauthorized nodes, and unsafe node patches.
- [ ] Add timeline labels: `读取 Skill`, `理解画布`, `补充信息`, `制定计划`, `等待确认`, `提交生成`, `检查结果`, `回填画布`.
- [ ] Test legal transitions, duplicate approval, cancellation, stale approval, credit policy, and event replay order.
- [ ] Commit as `feat(agent): add durable skill run state machine`.

### Task 10: Execute Skill image/video steps through existing tools

**Files:**
- Create: `apps/api/src/modules/agent/tools/skill-step-runner.ts`
- Modify: `apps/api/src/modules/agent/agent-tool-registry.ts`
- Modify: `apps/api/src/modules/agent/agent-tool-runner.ts`
- Modify: `apps/api/src/modules/agent/agent-workflow-launcher.ts`
- Modify: `apps/worker/src/workflow-runtime/service.ts` only for Skill metadata propagation
- Test: `apps/api/test/agent-skill-step-runner.test.ts`
- Test: `apps/worker/test/agent-skill-metadata.test.ts`

- [ ] Map normalized actions to `analyze`, `create_canvas`, `generate_image`, `generate_video`, `review`, and `deliver`.
- [ ] Resolve product-visible model choices to internal routes only in the server launcher.
- [ ] Create a Skill step record before every paid workflow and link workflow/node IDs after launch.
- [ ] Reuse existing reserve/settle/refund and idempotency paths; do not create a second billing implementation.
- [ ] Pass only Skill run/step IDs to Worker metadata; never pass credentials or raw provider configuration.
- [ ] Test image run, video run, partial batch success, provider failure/refund, missing-pricing fail-closed, and retry identity.
- [ ] Run API, Worker, AI Gateway Core, and billing-focused tests.
- [ ] Commit as `feat(agent): execute skill image and video steps`.

### Task 11: Add delivery checks and canvas/asset write-back

**Files:**
- Create: `apps/api/src/modules/agent/skill-delivery-checks.ts`
- Modify: `apps/api/src/modules/agent/agent-canvas.service.ts`
- Modify: `src/flowCanvas/agent/CanvasAgentResultCard.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentTaskCard.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentCanvasOpsCard.tsx`
- Test: `apps/api/test/agent-skill-delivery.test.ts`
- Test: `src/flowCanvas/agent/CanvasAgentSkillResults.test.tsx`

- [ ] Check required artifact count, modality, duration/aspect metadata when available, asset persistence, and result-node links.
- [ ] Mark a run `reviewing` when a result exists but a delivery check is incomplete; never claim completion from text alone.
- [ ] Create result nodes with `assetId` and safe Skill run/step metadata only; never store URLs/base64/blob data.
- [ ] Show retry, place-on-canvas, continue-from-result, and view-run actions.
- [ ] Test missing asset, wrong modality, partial success, successful delivery, revision conflict, and failed-step retry.
- [ ] Run focused frontend/API tests and production build.
- [ ] Commit as `feat(agent): verify skill delivery and link canvas results`.

## Workstream D: Release and Verification

### Task 12: Add deployment, seed, observability, and rollback documentation

**Files:**
- Modify: `docker-compose.staging.yml`
- Modify: `docs/STAGING_ENV_TEMPLATE.md`
- Modify: `docs/v2-local-development.md`
- Modify: `docs/PRODUCTION_RUNBOOK.md`
- Modify: `docs/staging-runbook.md`
- Modify: `PROJECT_RECORD.md`

- [ ] Document disabled-by-default flags and the order for enabling authoring then runtime.
- [ ] Document rollback by disabling `AGENT_SKILL_RUNTIME_ENABLED`, stopping the worker before schema rollback only when required, and preserving historical Skill/run rows.
- [ ] Document production migrations with `node packages/db/dist/cli.js`.
- [ ] Add observability fields for Skill ID/version, run duration, first-event latency, failed step, retry count, and redaction hits; keep provider internals out of creator-facing logs.
- [ ] Update `PROJECT_RECORD.md` with migration, seed, flags, and smoke-test status.
- [ ] Commit as `docs(agent): document skill runtime deployment and rollback`.

### Task 13: Run contract, UI, security, and end-to-end acceptance

**Files:**
- Create: `apps/api/test/agent-skill-e2e.contract.test.ts`
- Create: `src/flowCanvas/agent/CanvasAgentSkillIntegration.test.tsx`
- Modify: `docs/CODEX_HANDOFF.md`
- Modify: `PROJECT_RECORD.md`

- [ ] Run: open project -> select official Skill -> attach current canvas image -> Agent asks for missing duration -> plan appears -> model/size changes update estimate -> approval -> image/video task -> asset -> result node -> refresh -> timeline replay.
- [ ] Run private authoring: describe Skill -> answer one question -> preview -> edit method/output -> save -> select -> run.
- [ ] Run failures: invalid planner output, missing pricing, insufficient credits, provider failure/refund, canvas conflict, event disconnect, and stale approval.
- [ ] Scan API responses, events, drafts, and screenshots for `apiKey`, `Authorization`, `baseUrl`, provider internals, raw route keys, signed URLs, data URLs, blob URLs, and base64 media.
- [ ] Run `npm run build`, `npm test`, `npm run test --workspace @aigc-flow/api`, `npm run test --workspace @aigc-flow/worker`, `npm run test --workspace @aigc-flow/ai-gateway-core`, and `npm run test --workspace @aigc-flow/db`; record exact infrastructure-dependent skips and historical failures.
- [ ] Update `docs/CODEX_HANDOFF.md` and `PROJECT_RECORD.md` with completed phases, deployment flags, and known follow-ups.
- [ ] Commit as `test(agent): verify canvas-first skill production flow`.

## Deferred Work

Do not start until Task 13 passes in staging: public Skill marketplace, sharing/ratings/moderation, multi-agent roles, long-term memory, arbitrary uploaded Skill code, external tools, audio/3D execution, and autonomous budget loops.

## Execution Order

1. Tasks 1-4: persistence, contracts, official catalog.
2. Tasks 5-7: APIs and LibTV-style canvas UI.
3. Tasks 8-11: Skill-aware planning, durable runs, image/video execution, delivery.
4. Tasks 12-13: deployment, observability, smoke tests, handoff.

Production flags remain disabled until Task 13 passes in staging. Each task should be committed separately and leave the repository buildable.
