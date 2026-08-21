# Canvas Skill Workbench UI Design

## Goal

Make the right-side Agent visibly operate as a LibTV-style Skill workbench while keeping the canvas as the primary workspace. The first slice must show a complete product loop: select a Skill, describe the goal, inspect a plan, approve it, observe execution, and see the result linked back to the canvas.

## Product Boundary

This slice changes the Agent product layer only. It does not enable `AGENT_V2_RUNTIME_ENABLED` or `AGENT_V2_SKILLS_ENABLED`, replace the existing canvas, expose provider routes, or create a second Agent shell. The existing Agent session/event APIs remain the source of truth. When the V2 Skill API is unavailable or disabled, the UI must show a truthful unavailable state rather than pretending that a Skill executed.

Release scope:

- official Skill picker grouped into Text, Image, and Video;
- selected Skill identity/version shown persistently in the Agent header;
- plan workspace with step status, approval state, and safe estimate fields;
- approve/cancel/retry actions wired to existing session/run boundaries;
- result summaries linked to canvas node IDs or asset IDs;
- replay-safe restoration of selected Skill, plan, and run state from session events.

Out of scope:

- public Skill marketplace, ratings, sharing, or author profiles;
- Skill authoring/editor UI;
- provider/model/route configuration;
- enabling production runtime flags;
- a new backend execution engine.

## User Experience

### Panel layout

The existing right panel remains the fixed canvas side rail. Its body changes from a chat-first view to three stable zones:

1. **Skill bar**: a compact selector at the top of the work area. Empty state reads `选择一个创作 Skill`; selected state shows the Skill name, modality badge (`文本`, `图片`, or `视频`), version, and a change button. The selector opens a dense menu surface using the existing shared menu tokens.
2. **Work area**: the primary view is `执行计划` when a plan or run exists, otherwise an empty Skill start state. Each step is a compact row with ordinal, action label, target node/result, estimate, and status. Pending paid or batch work has a prominent `批准执行` action and a secondary `取消` action. Running work shows progress and `查看画布` focus action. Failed work shows `重试失败步骤` only.
3. **Composer dock**: the existing prompt composer remains at the bottom. It displays the selected Skill as a removable context chip and keeps current canvas/reference chips. Quick actions are icon+label commands: `换 Skill`, `继续`, and `重试` only when applicable.

The existing chat, history, and logs tabs remain available from the shell toolbar. Chat becomes an event/detail view, not the only representation of work. The panel must remain usable at the current desktop width and collapse without changing canvas state.

### Skill picker

The picker is a controlled client view over a server-provided list. It accepts only product-safe fields:

```ts
type AgentSkillPickerItem = {
  id: string;
  version: number;
  name: string;
  summary: string;
  modality: "text" | "image" | "video";
  category?: string;
  inputHints: Array<{ label: string; kind: "asset" | "choice" | "number" | "text"; required: boolean }>;
};
```

No route key, provider, credential, URL, or raw normalized instruction is accepted by the UI. If the list request fails, the picker shows `Skill 暂不可用` with a retry button; it does not fall back to hardcoded production routes.

### State model

The workbench state is derived from the existing session/replay state plus local selection:

```ts
type SkillWorkbenchState = {
  selectedSkill: AgentSkillPickerItem | null;
  pickerOpen: boolean;
  plan: {
    id: string;
    status: "draft" | "waiting_for_approval" | "running" | "succeeded" | "partial_success" | "failed" | "cancelled";
    estimatedCredits?: number;
    steps: Array<{
      id: string;
      index: number;
      action: "text" | "image" | "video" | "canvas" | "review" | "deliver";
      label: string;
      nodeId?: string | null;
      assetId?: string | null;
      status: "pending" | "waiting_for_approval" | "running" | "succeeded" | "failed" | "cancelled";
      error?: string;
    }>;
  } | null;
  unavailableReason?: string;
};
```

The selected Skill is included in the next turn request as `selectedSkillId` and `selectedSkillVersion`. It is cleared only when the user explicitly changes or removes it, or when the server reports that the version is unavailable. Refresh/replay restores it from the persisted turn/session metadata.

### Interaction rules

- Selecting a Skill never starts a generation.
- Submitting a prompt without a selected Skill remains supported and uses the current Agent behavior.
- Submitting with a selected Skill sends the Skill identity and current canvas revision; the server remains authoritative for the plan and pricing.
- A plan with `waiting_for_approval` renders approval controls and disables duplicate submit while approval is pending.
- Approval calls the existing Skill approval boundary with the current session ID and run ID. The UI never calls Workflow Run or billing APIs directly.
- Cancelling calls the existing Agent turn cancellation boundary and marks the plan cancelled in the UI after the event is confirmed.
- Successful text output shows a `文本节点` result and focuses the linked node when requested. Media output shows asset result cards and a `定位到画布` action.
- Repeated events are idempotently reduced by run/step ID; an old event cannot move a terminal step back to running.

## Component Boundaries

Create focused components under `src/flowCanvas/agent/`:

- `CanvasAgentSkillBar.tsx`: selected Skill summary and picker trigger;
- `CanvasAgentSkillPicker.tsx`: categorized picker, loading, empty, retry, and unavailable states;
- `CanvasAgentSkillPlan.tsx`: plan header, step rows, estimate, approval/cancel/retry commands;
- `CanvasAgentSkillStepRow.tsx`: one stable-height step row and result actions;
- `useCanvasAgentSkillWorkbench.ts`: selection, picker loading, plan projection, and action callbacks;
- `canvasAgentSkillTypes.ts`: product-safe client contracts and state types.

Modify `CanvasAgentPanel.tsx`, `CanvasAgentWorkspaceShell.tsx`, and the existing session/API helpers only where needed to compose these components. Do not duplicate event parsing or create a second session store.

## Data Flow

```text
Skill picker API -> safe picker items -> selectedSkillId/version
Prompt + selected skill + canvas snapshot -> existing Agent turn stream
V2 events / session replay -> plan projection -> plan and step rows
Approve/cancel/retry command -> existing Agent Skill boundary -> durable events
Workflow/asset result event -> step result -> optional canvas focus
```

The first UI implementation may use a typed adapter over the existing available Skill endpoint if one already exists. If the endpoint is not present in the current server, the adapter returns `unavailable` and the UI remains truthful; adding a new endpoint is a separate backend task, not a reason to hardcode Skill definitions or routes in React.

## Error Handling

- `SKILL_RUNTIME_DISABLED`: show a disabled explanation and keep normal Agent chat available.
- `SKILL_VERSION_NOT_FOUND`: clear selection, preserve the prompt draft, and ask the user to select another Skill.
- `FLOW_DRAFT_REVISION_CONFLICT`: show a refresh/review action; never silently overwrite the canvas.
- `SKILL_RUN_STALE_APPROVAL`: refresh the plan from replay and remove the approval button.
- network/SSE disconnect: retain the last durable plan, show reconnect state, and replay by sequence on reconnect.
- unknown event fields: ignore them; only product-safe fields enter the workbench state.

## Accessibility and Visual Rules

- All icon-only controls use existing Lucide icons, accessible labels, and tooltips.
- Plan rows use stable dimensions so status changes cannot shift the composer.
- Menus use the shared 38px row density and `MenuSurface`/`MenuSelect`; no native `<select>` or one-off popover styles.
- Approval is a text+icon command with a clear disabled/loading state, not a decorative badge.
- The panel must support keyboard navigation for Skill picker, plan actions, and Escape dismissal.
- Use existing dark canvas palette with one restrained accent for active/approval states; do not add gradients or decorative blobs.

## Acceptance Criteria

1. Opening the Agent shows a visible `选择一个创作 Skill` control above the composer.
2. The picker groups server-provided official Skills into text/image/video and handles loading/error/empty states.
3. Selecting a Skill visibly changes the header and composer context without launching work.
4. A selected-Skill turn renders an execution plan with ordered steps and safe estimate/status fields.
5. A pending paid/batch plan exposes `批准执行` and `取消`; duplicate approval is disabled while pending.
6. Refreshing/reopening the session restores the selected Skill and plan timeline from durable events.
7. Text, image, and video result steps expose product-safe result actions tied to canvas node or asset IDs.
8. Existing chat/history/log tabs and no-Skill Agent flow continue to work.
9. Focused frontend tests and `npm run build` pass; runtime flags remain disabled.
