# Agent Panel Handdrawn V1 Design

## 1. Goal

Rebuild the TapFlow Agent panel to match the user's hand-drawn right-side workspace and the useful interaction patterns from `CookSleep/gpt_image_playground`, while preserving TapFlow v2 architecture:

- authenticated, tenant-aware API access
- server-side Agent sessions and replay
- authoritative flow drafts on the server
- assets stored in the v2 asset library and object storage
- billing reserve/settle/refund through the existing workflow path
- AI Gateway-backed model and route selection

This phase focuses on the creator-facing Agent workspace experience and the missing reference-image execution path. It does not replace TapFlow with the reference project's local-only storage, frontend API key model, or standalone image playground architecture.

## 2. Scope

Phase 1 includes:

- A right-side docked Agent panel with the hand-drawn structure:
  - top icon toolbar: logs, chat, history, new chat, collapse
  - central multi-turn conversation stream
  - inline Agent result/task cards
  - bottom text input area
  - compact model/line and image parameter controls
  - upload-reference-image button near the submit button
- A real upload-reference flow:
  - upload image files through the existing v2 asset path
  - render uploaded references as chips/thumbnails above the prompt
  - submit stable `assetId`/`refId` references with the Agent turn
  - never persist base64/data/blob/signed URLs into canvas graph JSON
- A structured reference context shared by frontend and backend:
  - selected canvas image nodes
  - uploaded reference images
  - historical Agent result assets
  - active continuation result selections
- Correct mapping from user-facing `refId` values to server-side `assetId` values before generation execution.
- Cleaner result cards with image thumbnails, status, placement actions, and continuation shortcuts.
- Focused tests for shell layout, composer reference uploads, result cards, Agent reference context, backend reference resolution, and build safety.

Phase 1 excludes:

- Full branch editing and branch switching like `gpt_image_playground`.
- Editing a prior user round and regenerating from that round.
- Web search.
- A new model/provider configuration system.
- Local IndexedDB as authoritative storage.
- MCP/local Agent process integration.
- Automatic destructive canvas changes without confirmation.

## 3. Reference Reading

The hand sketch defines the first-priority layout:

- The Agent panel is a right-side dock beside the canvas.
- Top tools are icon-first: logs, conversation, history, new chat, collapse.
- The main body is a conversation between user and Agent, showing turn numbers.
- Agent replies can include generated image cards and subsequent actions.
- The bottom composer has a large text area, compact settings, a plus button for reference images, and a submit button.

The reference project contributes useful patterns:

- Agent-first multi-turn image production.
- Inline generated image/task cards inside assistant messages.
- A bottom floating prompt bar as the visual anchor.
- `@`/reference-like image continuity across turns.
- Generated images can become the basis for the next turn.

TapFlow must adapt these patterns to the v2 product:

- references become `assetId`/`refId`, not local image IDs or data URLs
- generated outputs remain v2 assets and canvas nodes
- model/provider secrets remain server-side
- pricing and credit approval remain server-side
- session history is scoped by current project and flow

## 4. Current Code Context

Primary frontend files:

- `src/flowCanvas/agent/CanvasAgentPanel.tsx`
- `src/flowCanvas/agent/CanvasAgentWorkspaceShell.tsx`
- `src/flowCanvas/agent/CanvasAgentComposer.tsx`
- `src/flowCanvas/agent/CanvasAgentConversationView.tsx`
- `src/flowCanvas/agent/CanvasAgentTimelineItem.tsx`
- `src/flowCanvas/agent/CanvasAgentResultCard.tsx`
- `src/flowCanvas/agent/CanvasAgentReferenceChips.tsx`
- `src/flowCanvas/agent/agentWorkspaceTimeline.ts`
- `src/flowCanvas/agent/useCanvasAgentSession.ts`
- `src/flowCanvas/agent/canvasAgentApi.ts`
- `src/assets/assetApi.ts`

Primary backend files:

- `apps/api/src/modules/agent/agent.schemas.ts`
- `apps/api/src/modules/agent/agent.routes.ts`
- `apps/api/src/modules/agent/agent.service.ts`
- `apps/api/src/modules/agent/agent-executor.service.ts`
- `apps/api/src/modules/agent/agent-tool-schemas.ts`
- `apps/api/src/modules/agent/agent-tool-runner.ts`
- `apps/api/src/modules/agent/agent-asset-references.ts`
- `apps/api/src/modules/agent/agent-executor-prompt.ts`

Important current issue:

The backend tool schema currently exposes `referenceRefs` on image tools, but `AgentToolRunner` eventually passes those values as `referenceAssetIds` to the workflow launcher. Phase 1 must make this mapping explicit. User-facing references can be `refId`; execution references must be resolved to `assetId`.

## 5. Product Design

### 5.1 Shell

The Agent shell becomes a compact docked panel, not a settings-heavy mini app.

Top toolbar order:

1. Logs: opens execution/activity log view.
2. Chat: returns to current conversation stream.
3. History: opens scoped Agent session list.
4. New chat: creates a new session and clears in-memory turn state.
5. Collapse: closes the Agent panel.

The toolbar uses lucide icons with accessible labels and tooltips. Text labels are not shown in the main chrome unless needed by accessibility tests. Active state should be visible through icon color/background.

The shell has three vertical regions:

- toolbar/header
- scrollable conversation area
- bottom composer dock

The shell must not overlap existing canvas toolbar controls. It should preserve the current top clearance behavior unless visual verification shows it needs adjustment.

### 5.2 Conversation Stream

The conversation stream is the default surface.

Message rendering:

- User messages align right and show `用户 第 N 轮` when a turn index is known.
- Agent messages align left or stretch and show `Agent 第 N 轮` when a turn index is known.
- System/error messages use compact warning styling.
- Long prompts wrap safely and do not resize surrounding controls.

Assistant messages can include:

- short text response
- status rows such as "正在读取画布", "正在提交生成任务", "正在等待模型返回结果"
- approval/parameter cards
- canvas-op preview cards
- generated result cards
- failure cards

The stream should keep an empty state, but it should be one compact block rather than marketing-like cards.

### 5.3 Result Cards

Generated results render inline in the Agent timeline.

Each result card should show:

- thumbnail when a safe preview URL is available
- fallback image frame while preview resolves
- label, dimensions if known, and result type
- status: running, succeeded, partial success, failed, placed on canvas
- actions:
  - place on canvas
  - continue edit
  - make variant
  - make poster
  - compare

The action labels are user-facing Chinese labels. They must not expose route keys, upstream model names, provider names, or signed URLs.

### 5.4 Composer

The composer becomes the visual anchor at the bottom.

It includes:

- reference strip above the text input
- large prompt textarea
- compact settings row:
  - product model display name
  - friendly line label
  - size/resolution
  - aspect ratio
  - estimated credits when available
- plus/upload reference button
- submit button

The model/line/parameter controls stay compact and secondary. They can open shared menu surfaces for selection. The UI should use shared menu components where possible:

- `src/components/menu/MenuSurface.tsx`
- `src/components/menu/MenuSelect.tsx`
- `src/components/menu/useDismissibleLayer.ts`
- shared row density tokens

The composer should support:

- Click-to-send for Phase 1. Keyboard send shortcuts are deferred so this change does not create accidental submissions while users write long prompts.
- Disabled state while Agent is reading context, thinking, applying ops, or running workflow.
- Draft preservation while busy.
- Clear upload failure messages.

### 5.5 Uploaded References

Uploaded references are first-class Agent input references.

Flow:

1. User clicks plus button.
2. User selects one or more image files.
3. Frontend uploads through `uploadAssetFile({ file, projectId })`.
4. Frontend shows upload state and local preview only as temporary UI convenience.
5. On success, frontend stores a reference chip:

```ts
type AgentReferenceChip = {
  id: string;
  kind: "upload";
  label: string;
  assetId: string;
  previewUrl?: string;
  refId: string;
};
```

6. When the user sends the prompt, the turn payload includes these references in a structured `referenceContext`.
7. Backend validates that every asset belongs to the current tenant and optional project scope.
8. Backend gives the model a safe reference summary.
9. If the model uses a `refId`, the server resolves it to `assetId` before launching generation.

Temporary preview URLs must not be persisted in Agent messages, canvas graph JSON, tool-call arguments, or generated node data.

### 5.6 Reference Context

Add a shared reference context to Agent turns.

Frontend type:

```ts
type AgentReferenceContextItem = {
  assetId: string;
  kind: "artifact" | "canvas_node" | "upload";
  label: string;
  nodeId?: string;
  refId: string;
};

type AgentReferenceContext = {
  items: AgentReferenceContextItem[];
};
```

Turn requests gain:

```ts
{
  continuationContext?: AgentContinuationContext | null;
  prompt: string;
  referenceContext?: AgentReferenceContext;
  snapshot: CanvasAgentSnapshot;
}
```

Backend validation:

- `assetId` is required.
- `refId` is required and stable within the turn.
- max reference count is 8 for this phase.
- references must belong to the tenant.
- image-generation references must be image assets.
- duplicate `refId` values are rejected.

Executor model context includes only safe fields:

```json
{
  "references": [
    {
      "refId": "upload-1",
      "assetId": "asset-uuid",
      "kind": "upload",
      "label": "参考图 1"
    }
  ]
}
```

The model is instructed to use `referenceRefs: ["upload-1"]` or similar user-facing refs. Before execution, the server resolves those refs to asset IDs.

### 5.7 Reference Resolution

Add a deterministic resolver near the executor/tool-runner boundary.

Input sources:

- `referenceContext.items`
- `continuationContext.assetId/assetIds`
- previous successful session asset refs from `listSessionAssetRefs`

Resolution rules:

- If a tool call has no `referenceRefs`, use continuation references when available.
- If `referenceRefs` contains values matching known `refId`, resolve them to `assetId`.
- If a value already matches a known `assetId`, accept it only if it is in the allowed reference set for the turn/session.
- If any value is unknown, reject the tool call with a user-facing error.
- Never fetch arbitrary asset IDs supplied by the model unless they are in the validated reference context or previous result set.

Tool task metadata may store both:

- safe `referenceRefs` for user/audit visibility
- resolved `referenceAssetIds` for execution

Creator UI should show labels/refIds, not raw signed URLs or provider internals.

## 6. Backend Design

### 6.1 Schemas

Modify `createAgentTurnSchema` and `executeAgentTurnSchema` to accept `referenceContext`.

Add reusable schemas:

```ts
const agentReferenceContextItemSchema = z.object({
  assetId: z.string().trim().min(1).max(200),
  kind: z.enum(["artifact", "canvas_node", "upload"]),
  label: z.string().trim().min(1).max(120),
  nodeId: z.string().trim().min(1).max(200).optional(),
  refId: z.string().trim().min(1).max(120),
}).strict();

const agentReferenceContextSchema = z.object({
  items: z.array(agentReferenceContextItemSchema).max(8).default([]),
}).strict();
```

### 6.2 Executor Input

Extend `AgentExecutorTurnInput` and `AgentToolRunInput` with `referenceContext`.

`buildUserExecutorContext(...)` should include:

- active continuation
- previous results
- current references
- canvas summary
- user prompt

Prompt rule additions:

- The model may refer to current reference images only by the provided `refId`.
- The model must not invent references.
- For edit/generation using references, it must place those refs into `referenceRefs`.

### 6.3 Tool Runner

Update `AgentToolRunner.launchOne(...)`:

- Resolve `referenceRefs` through a new helper before calling `launchImageGeneration`.
- Pass `referenceAssetIds` as true asset IDs.
- Store task input with safe ref labels and resolved asset IDs in server-side `agent_tasks.input_json`; creator-facing UI renders labels/refIds only.

Suggested helper:

```ts
resolveAgentReferenceAssetIds({
  continuationContext,
  previousResults,
  referenceContext,
  requestedRefs,
})
```

This helper should be independently unit-tested.

### 6.4 Security

Maintain existing redaction requirements:

- no raw API keys
- no credentials
- no base URLs
- no Authorization headers
- no upstream model internals in creator UI
- no temporary signed URLs in persisted Agent/canvas payloads

All new APIs remain under `/api/v2/agent/*` and must require authenticated tenant context.

## 7. Frontend Design

### 7.1 New/Changed Components

Create:

- `src/flowCanvas/agent/CanvasAgentReferenceUploadButton.tsx`
- `src/flowCanvas/agent/agentReferenceContext.ts`

Modify:

- `CanvasAgentWorkspaceShell.tsx`
- `CanvasAgentPanel.tsx`
- `CanvasAgentComposer.tsx`
- `CanvasAgentReferenceChips.tsx`
- `CanvasAgentConversationView.tsx`
- `CanvasAgentTimelineItem.tsx`
- `CanvasAgentResultCard.tsx`
- `agentWorkspaceTimeline.ts`
- `canvasAgentApi.ts`
- `useCanvasAgentSession.ts`

### 7.2 Upload Button

The upload button is a lucide `Plus` icon button near the submit button, matching the hand sketch.

States:

- idle
- uploading
- failed
- disabled

It accepts `image/*` files only for Phase 1. Multiple uploads are allowed up to the reference limit.

The upload component returns successful chips to the composer/panel owner. The panel owns the current-turn upload references so they can be included in the send request and cleared intentionally after send.

### 7.3 Composer Reference Strip

The reference strip merges:

- selected canvas node chips
- continuation chips
- uploaded chips

Chips should show:

- compact label
- optional thumbnail for uploaded/image references
- remove button for uploaded references
- insert action that adds the `refId` to the prompt only when useful

Uploaded references are removable before send. Historical result chips and selected canvas chips are not removable in Phase 1; they remain derived from current selection/continuation state.

### 7.4 Panel State

Panel state includes:

- active tab/view: chat, history, logs
- current uploaded references
- current draft
- current session id
- selected canvas references
- continuation context

When new chat is clicked:

- clear current session id
- clear current uploaded references
- clear continuation context
- clear current plan, tool timeline, activity timeline, and current error state
- keep selected canvas references derived from current selection

When a prompt is sent:

- include current uploaded references and selected/continuation references in `referenceContext`
- clear uploaded references after successful turn submission starts, unless upload failure prevents sending
- preserve draft if sending fails before submission

## 8. Testing

Frontend tests:

- `CanvasAgentWorkspaceShell.test.tsx`
  - toolbar order and accessible labels
  - chat/history/log/new/collapse actions
- `CanvasAgentComposer.test.tsx`
  - upload button present
  - reference strip above textarea
  - settings row stays compact
  - send payload includes references
  - disabled states
- `CanvasAgentReferenceUploadButton.test.tsx`
  - calls asset upload
  - renders uploading/error states
  - returns `upload` chips
  - rejects non-image files before upload
- `CanvasAgentPanel.test.tsx`
  - selected + uploaded + continuation refs merge into send payload
  - new chat clears upload refs
  - history remains scoped by project/flow
- `CanvasAgentResultCard.test.tsx`
  - clean Chinese copy
  - thumbnails/actions render
  - continuation action passes all selected assets
- `agentWorkspaceTimeline.test.ts`
  - result/task/status ordering
  - no raw replay event debug block in normal chat

Backend tests:

- `agent.schemas.test.ts`
  - accepts valid `referenceContext`
  - rejects duplicate/oversized refs
- `agent-executor.test.ts`
  - model context includes safe references
  - no provider internals leak
- `agent-tool-runner.test.ts`
  - resolves `refId` to `assetId`
  - unknown refs fail closed
  - continuation refs still work
  - uploaded refs override no-reference default when requested
- `agent-tool-schemas.test.ts`
  - `referenceRefs` remain safe user-facing strings

Verification commands:

```bash
npm test -- src/flowCanvas/agent
npm run test --workspace @aigc-flow/api -- agent-executor.test.ts agent-tool-runner.test.ts agent-tool-schemas.test.ts
npm run build
```

If backend work touches db queries or asset ownership validation deeply, also run:

```bash
npm run test --workspace @aigc-flow/api
```

## 9. Manual QA

Minimum manual pass:

1. Open a project canvas and open Agent.
2. Confirm the panel matches the hand-drawn structure.
3. Send a prompt without references.
4. Upload one reference image and send "参考这张图做一张电影海报".
5. Confirm upload creates an asset and the Agent request uses only asset/ref identity.
6. Confirm generated output appears as an Agent result card.
7. Place generated output on canvas.
8. Use "继续编辑" from the result card.
9. Open history and return to the conversation.
10. Open logs and confirm progress is readable and does not expose provider internals.
11. Close/reopen the panel and confirm replay restores result cards.

Negative QA:

- upload failure shows a recoverable error
- unknown reference ref fails clearly
- no generated node stores base64/data/blob/signed URL as authoritative source
- no creator-facing view shows provider/baseUrl/API key/upstream model/raw Authorization

## 10. Documentation

After implementation, update:

- `PROJECT_RECORD.md`
- `docs/CODEX_HANDOFF.md` if the behavior changes materially

No deployment docs are required unless new environment variables or staging operations are introduced. Phase 1 should not require new production dependencies.

## 11. Acceptance Criteria

Phase 1 is complete when:

- The default Agent panel visually follows the hand sketch.
- Chat/history/log/new/collapse are available from the top icon toolbar.
- The bottom composer has prompt-first layout, compact settings, upload reference image, and submit controls.
- Uploaded references are v2 assets and appear as current-turn reference chips.
- Agent turn requests include structured reference context.
- Backend resolves model-provided `refId` values to validated `assetId` values before generation.
- Result cards render inline with usable follow-up actions.
- Session history/replay still works.
- Provider secrets and route internals are not exposed.
- `npm run build` passes, or any failure is documented with exact cause.
- Relevant frontend and backend Agent tests pass.

## 12. Open Decisions

Resolved for Phase 1:

- Follow the recommended scope from the initial plan.
- Keep branch editing/regeneration out of Phase 1.
- Use v2 assets for uploaded references.
- Do not copy reference project's local storage or frontend provider settings.

Deferred:

- Full branch switching and edit-regenerate workflow.
- Web search in Agent.
- Rich `@` mention autocomplete inside the composer.
- Multi-agent or local MCP bridge as a primary user-facing workflow.
