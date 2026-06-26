# Agent Workspace V2 Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild TapFlow Agent as an infinite-canvas-style right-side production workspace with conversation history, references, model parameters, visible tool execution, and result cards while keeping TapFlow's server-side v2 architecture.

**Architecture:** Keep the existing Agent executor, session, event, task, asset, workflow, AI Gateway, and billing backends. Replace the frontend presentation with a docked `Agent Workspace V2` shell, a production composer, a unified timeline adapter, history/config/log tabs, and result cards that hide provider internals.

**Tech Stack:** Vite + React, TypeScript, existing `src/flowCanvas/agent/*` modules, Fastify `/api/v2/agent/*` endpoints, existing AI Gateway run settings, existing workflow/asset/billing runtime.

---

## Source Documents

- Design spec: `docs/superpowers/specs/2026-06-26-agent-workspace-v2-redesign-design.md`
- Existing Director plan: `docs/superpowers/plans/2026-06-24-canvas-director-agent-plan.md`
- Project rules: `AGENTS.md`
- Reference source: `D:\infinite-canvas\infinite-canvas\infinite-canvas\web\src\app\(user)\canvas\components\canvas-assistant-panel.tsx`

## File Structure

Create these focused frontend files:

- `src/flowCanvas/agent/CanvasAgentWorkspaceTypes.ts`
  - View-model types for tabs, composer state, references, timeline items, and result cards.
- `src/flowCanvas/agent/agentWorkspaceTimeline.ts`
  - Pure adapter from current Agent state/events to unified user-facing timeline items.
- `src/flowCanvas/agent/CanvasAgentWorkspaceShell.tsx`
  - Docked right panel shell, resize, collapse, header, and tabs.
- `src/flowCanvas/agent/CanvasAgentTabs.tsx`
  - Shared tab navigation for `对话`, `历史`, `连接配置`, `日志`.
- `src/flowCanvas/agent/CanvasAgentConversationView.tsx`
  - Conversation timeline surface and empty state.
- `src/flowCanvas/agent/CanvasAgentHistoryView.tsx`
  - Session list, new chat, open session, and safe empty state.
- `src/flowCanvas/agent/CanvasAgentConnectionView.tsx`
  - User-facing available model/line status.
- `src/flowCanvas/agent/CanvasAgentLogView.tsx`
  - Safe troubleshooting view, no provider secrets.
- `src/flowCanvas/agent/CanvasAgentReferenceChips.tsx`
  - Reference chip rendering for selected nodes, uploaded assets, and prior artifacts.
- `src/flowCanvas/agent/CanvasAgentModelRoutePicker.tsx`
  - Product-facing model and line picker.
- `src/flowCanvas/agent/CanvasAgentTimeline.tsx`
  - Unified timeline list renderer.
- `src/flowCanvas/agent/CanvasAgentTimelineItem.tsx`
  - Message, status, parameter, tool, result, and error item renderer.
- `src/flowCanvas/agent/CanvasAgentResultCard.tsx`
  - Generated asset/result card with canvas and continuation actions.
- `src/flowCanvas/agent/useAgentWorkspacePanel.ts`
  - Panel UI state: tab, width, collapse state, selected/default settings.

Modify these existing frontend files:

- `src/flowCanvas/agent/CanvasAgentPanel.tsx`
  - Convert to orchestration layer that wires existing hooks into the new workspace shell.
- `src/flowCanvas/agent/CanvasAgentComposer.tsx`
  - Replace simple textarea with production composer.
- `src/flowCanvas/agent/CanvasAgentParameterCard.tsx`
  - Reuse inside timeline; polish copy and hide internal strings.
- `src/flowCanvas/agent/useCanvasAgentSession.ts`
  - Add hooks/handlers needed by new composer without changing backend execution semantics.
- `src/flowCanvas/agent/canvasAgentApi.ts`
  - Add session delete/rename API only if backend task adds support.
- `src/flowCanvas/canvas/AiFlowCanvas.tsx`
  - Adjust Agent panel mount only if docked shell needs parent layout coordination.

Add or update tests:

- `src/flowCanvas/agent/agentWorkspaceTimeline.test.ts`
- `src/flowCanvas/agent/CanvasAgentWorkspaceShell.test.tsx`
- `src/flowCanvas/agent/CanvasAgentTabs.test.tsx`
- `src/flowCanvas/agent/CanvasAgentConversationView.test.tsx`
- `src/flowCanvas/agent/CanvasAgentHistoryView.test.tsx`
- `src/flowCanvas/agent/CanvasAgentComposer.test.tsx`
- `src/flowCanvas/agent/CanvasAgentModelRoutePicker.test.tsx`
- `src/flowCanvas/agent/CanvasAgentTimeline.test.tsx`
- `src/flowCanvas/agent/CanvasAgentResultCard.test.tsx`
- update `src/flowCanvas/agent/CanvasAgentPanel.test.tsx`

Backend changes should be minimal in the first pass. Add only if needed:

- `apps/api/src/modules/agent/agent.routes.ts`
- `apps/api/src/modules/agent/agent.schemas.ts`
- `apps/api/src/modules/agent/agent.service.ts`

Documentation updates:

- `PROJECT_RECORD.md`

---

## Task 1: Add Workspace View Types And Timeline Adapter

**Files:**

- Create: `src/flowCanvas/agent/CanvasAgentWorkspaceTypes.ts`
- Create: `src/flowCanvas/agent/agentWorkspaceTimeline.ts`
- Test: `src/flowCanvas/agent/agentWorkspaceTimeline.test.ts`

- [ ] **Step 1: Write timeline adapter tests**

Create `src/flowCanvas/agent/agentWorkspaceTimeline.test.ts` with tests covering:

```ts
import { describe, expect, it } from "vitest";

import { buildAgentWorkspaceTimeline } from "./agentWorkspaceTimeline";

describe("buildAgentWorkspaceTimeline", () => {
  it("combines user messages, status events, tool cards, and result cards in one timeline", () => {
    const timeline = buildAgentWorkspaceTimeline({
      activityItems: [
        { id: "status-1", label: "Understanding request", state: "active", detail: "Reading canvas context." },
      ],
      error: null,
      messages: [
        { id: "user-1", role: "user", content: "生成一张动物运动会海报" },
      ],
      toolItems: [
        {
          assetRefs: [],
          status: "awaiting_approval",
          title: "Image generation",
          toolCallKey: "tool-1",
          toolName: "generate_image",
          estimate: {
            imageRunSettings: [],
          },
        },
      ],
    });

    expect(timeline.map((item) => item.kind)).toEqual(["message", "status", "parameter"]);
    expect(timeline[0]).toMatchObject({ kind: "message", role: "user" });
    expect(timeline[1]).toMatchObject({ kind: "status", title: "正在理解需求" });
    expect(timeline[2]).toMatchObject({ kind: "parameter", toolCallKey: "tool-1" });
  });

  it("converts successful tool assets into a result item", () => {
    const timeline = buildAgentWorkspaceTimeline({
      activityItems: [],
      error: null,
      messages: [],
      toolItems: [
        {
          activeAssetRefId: "ref-1",
          assetRefs: [
            { assetId: "asset-1", label: "结果 1", refId: "ref-1" },
          ],
          placedNodeIds: ["node-1"],
          status: "succeeded",
          title: "Image generation",
          toolCallKey: "tool-1",
          toolName: "generate_image",
        },
      ],
    });

    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      assets: [{ assetId: "asset-1", label: "结果 1", refId: "ref-1" }],
      kind: "result",
      placedNodeIds: ["node-1"],
    });
  });

  it("does not expose raw internal event names in status titles", () => {
    const timeline = buildAgentWorkspaceTimeline({
      activityItems: [
        { id: "raw", label: "workflow_run_linked", state: "active", detail: "workflow_run_linked" },
      ],
      error: null,
      messages: [],
      toolItems: [],
    });

    expect(JSON.stringify(timeline)).not.toContain("workflow_run_linked");
    expect(timeline[0]).toMatchObject({ kind: "status", title: "正在等待模型返回结果" });
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- src/flowCanvas/agent/agentWorkspaceTimeline.test.ts
```

Expected: fail because files do not exist.

- [ ] **Step 3: Create workspace types**

Create `src/flowCanvas/agent/CanvasAgentWorkspaceTypes.ts`:

```ts
import type { CanvasAgentMessage } from "./useCanvasAgentSession";
import type { CanvasAgentActivityItem } from "./CanvasAgentActivityTimeline";
import type { AgentImageRunSettingsModel } from "./agentRunSettings";
import type { CanvasAgentToolAssetRef, CanvasAgentToolTimelineItem } from "./canvasAgentToolTypes";

export type AgentWorkspaceTab = "chat" | "history" | "connections" | "logs";

export type AgentReferenceChip = {
  id: string;
  kind: "canvas_node" | "upload" | "artifact";
  label: string;
  assetId?: string;
  nodeId?: string;
  refId?: string;
  previewUrl?: string;
};

export type AgentResultAsset = CanvasAgentToolAssetRef;

export type AgentWorkspaceTimelineItem =
  | {
      content: string;
      createdAt?: string;
      id: string;
      kind: "message";
      references?: AgentReferenceChip[];
      role: CanvasAgentMessage["role"];
    }
  | {
      detail?: string;
      id: string;
      kind: "status";
      state: "active" | "completed" | "failed" | "queued";
      title: string;
    }
  | {
      id: string;
      kind: "parameter";
      models: AgentImageRunSettingsModel[];
      referenceRefs?: string[];
      toolCallKey: string;
    }
  | {
      id: string;
      kind: "tool";
      status: CanvasAgentToolTimelineItem["status"];
      summary: string;
      title: string;
      toolCallKey: string;
    }
  | {
      assets: AgentResultAsset[];
      id: string;
      kind: "result";
      placedNodeIds?: string[];
      toolCallKey: string;
    }
  | {
      id: string;
      kind: "error";
      message: string;
      retryable: boolean;
      title: string;
    };

export type BuildAgentWorkspaceTimelineInput = {
  activityItems: CanvasAgentActivityItem[];
  error: string | null;
  messages: CanvasAgentMessage[];
  toolItems: CanvasAgentToolTimelineItem[];
};
```

- [ ] **Step 4: Implement timeline adapter**

Create `src/flowCanvas/agent/agentWorkspaceTimeline.ts`:

```ts
import type { BuildAgentWorkspaceTimelineInput, AgentWorkspaceTimelineItem } from "./CanvasAgentWorkspaceTypes";

function userFacingStatus(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized.includes("workflow") || normalized.includes("model result")) return "正在等待模型返回结果";
  if (normalized.includes("generation") || normalized.includes("submitting")) return "正在提交生成任务";
  if (normalized.includes("saving") || normalized.includes("result")) return "正在保存到素材库";
  if (normalized.includes("canvas")) return "正在放入画布";
  if (normalized.includes("completed")) return "已完成";
  if (normalized.includes("failed")) return "任务失败";
  return "正在理解需求";
}

function toolSummary(status: string): string {
  if (status === "running") return "Agent 正在执行这一步生产任务。";
  if (status === "succeeded") return "这一步已经完成。";
  if (status === "failed") return "这一步执行失败，可以调整参数后重试。";
  if (status === "awaiting_approval") return "执行前需要你确认模型、参数和积分。";
  return "Agent 已准备好这一步。";
}

export function buildAgentWorkspaceTimeline(input: BuildAgentWorkspaceTimelineInput): AgentWorkspaceTimelineItem[] {
  const items: AgentWorkspaceTimelineItem[] = [];

  for (const message of input.messages) {
    items.push({
      content: message.content,
      id: `message-${message.id}`,
      kind: "message",
      role: message.role,
    });
  }

  for (const activity of input.activityItems) {
    items.push({
      detail: activity.detail && activity.detail !== activity.label ? activity.detail : undefined,
      id: `status-${activity.id}`,
      kind: "status",
      state: activity.state,
      title: userFacingStatus(activity.label),
    });
  }

  for (const tool of input.toolItems) {
    if (tool.status === "awaiting_approval" && tool.estimate?.imageRunSettings) {
      items.push({
        id: `parameter-${tool.toolCallKey}`,
        kind: "parameter",
        models: tool.estimate.imageRunSettings,
        referenceRefs: tool.estimate.referenceRefs,
        toolCallKey: tool.toolCallKey,
      });
      continue;
    }

    if (tool.status === "succeeded" && tool.assetRefs.length > 0) {
      items.push({
        assets: tool.assetRefs,
        id: `result-${tool.toolCallKey}`,
        kind: "result",
        placedNodeIds: tool.placedNodeIds,
        toolCallKey: tool.toolCallKey,
      });
      continue;
    }

    items.push({
      id: `tool-${tool.toolCallKey}`,
      kind: "tool",
      status: tool.status,
      summary: tool.error ?? toolSummary(tool.status),
      title: tool.title || "生产任务",
      toolCallKey: tool.toolCallKey,
    });
  }

  if (input.error) {
    items.push({
      id: "agent-error",
      kind: "error",
      message: input.error,
      retryable: true,
      title: "Agent 执行失败",
    });
  }

  return items;
}
```

- [ ] **Step 5: Run timeline tests**

Run:

```bash
npm test -- src/flowCanvas/agent/agentWorkspaceTimeline.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/flowCanvas/agent/CanvasAgentWorkspaceTypes.ts src/flowCanvas/agent/agentWorkspaceTimeline.ts src/flowCanvas/agent/agentWorkspaceTimeline.test.ts
git commit -m "feat(agent): add workspace timeline adapter"
```

---

## Task 2: Build Docked Workspace Shell And Tabs

**Files:**

- Create: `src/flowCanvas/agent/CanvasAgentWorkspaceShell.tsx`
- Create: `src/flowCanvas/agent/CanvasAgentTabs.tsx`
- Create: `src/flowCanvas/agent/useAgentWorkspacePanel.ts`
- Test: `src/flowCanvas/agent/CanvasAgentWorkspaceShell.test.tsx`
- Test: `src/flowCanvas/agent/CanvasAgentTabs.test.tsx`

- [ ] **Step 1: Write shell and tab tests**

Create `src/flowCanvas/agent/CanvasAgentTabs.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentTabs } from "./CanvasAgentTabs";

describe("CanvasAgentTabs", () => {
  it("renders the four Agent workspace tabs", () => {
    render(<CanvasAgentTabs activeTab="chat" onChange={vi.fn()} />);

    expect(screen.getByRole("tab", { name: "对话" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "历史" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "连接配置" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "日志" })).toBeInTheDocument();
  });

  it("notifies when a tab is selected", () => {
    const onChange = vi.fn();
    render(<CanvasAgentTabs activeTab="chat" onChange={onChange} />);

    fireEvent.click(screen.getByRole("tab", { name: "历史" }));

    expect(onChange).toHaveBeenCalledWith("history");
  });
});
```

Create `src/flowCanvas/agent/CanvasAgentWorkspaceShell.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentWorkspaceShell } from "./CanvasAgentWorkspaceShell";

describe("CanvasAgentWorkspaceShell", () => {
  it("renders as a docked Agent workspace with header actions", () => {
    render(
      <CanvasAgentWorkspaceShell
        activeTab="chat"
        busy={false}
        onChangeTab={vi.fn()}
        onCollapse={vi.fn()}
        onNewChat={vi.fn()}
      >
        <div>Body</div>
      </CanvasAgentWorkspaceShell>,
    );

    expect(screen.getByText("TapFlow Agent")).toBeInTheDocument();
    expect(screen.getByText("Canvas Director")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新对话" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起 Agent" })).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("collapses when collapse button is clicked", () => {
    const onCollapse = vi.fn();
    render(
      <CanvasAgentWorkspaceShell
        activeTab="chat"
        busy={false}
        onChangeTab={vi.fn()}
        onCollapse={onCollapse}
        onNewChat={vi.fn()}
      >
        <div>Body</div>
      </CanvasAgentWorkspaceShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "收起 Agent" }));

    expect(onCollapse).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
npm test -- src/flowCanvas/agent/CanvasAgentWorkspaceShell.test.tsx src/flowCanvas/agent/CanvasAgentTabs.test.tsx
```

Expected: fail because components do not exist.

- [ ] **Step 3: Implement tabs**

Create `src/flowCanvas/agent/CanvasAgentTabs.tsx`:

```tsx
import React from "react";

import type { AgentWorkspaceTab } from "./CanvasAgentWorkspaceTypes";

const tabs: Array<{ id: AgentWorkspaceTab; label: string }> = [
  { id: "chat", label: "对话" },
  { id: "history", label: "历史" },
  { id: "connections", label: "连接配置" },
  { id: "logs", label: "日志" },
];

export function CanvasAgentTabs(props: {
  activeTab: AgentWorkspaceTab;
  onChange: (tab: AgentWorkspaceTab) => void;
}) {
  return (
    <div aria-label="Agent workspace tabs" role="tablist" style={{ display: "flex", gap: 6, padding: "0 12px 10px" }}>
      {tabs.map((tab) => {
        const active = props.activeTab === tab.id;
        return (
          <button
            aria-selected={active}
            key={tab.id}
            onClick={() => props.onChange(tab.id)}
            role="tab"
            style={{
              background: active ? "rgba(255,255,255,0.12)" : "transparent",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 999,
              color: active ? "#f8fafc" : "rgba(226,232,240,0.68)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 800,
              height: 30,
              padding: "0 10px",
            }}
            type="button"
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Implement panel state hook**

Create `src/flowCanvas/agent/useAgentWorkspacePanel.ts`:

```ts
import React from "react";

import type { AgentWorkspaceTab } from "./CanvasAgentWorkspaceTypes";

export function useAgentWorkspacePanel() {
  const [activeTab, setActiveTab] = React.useState<AgentWorkspaceTab>("chat");
  const [width, setWidth] = React.useState(420);

  const clampWidth = React.useCallback((nextWidth: number) => {
    setWidth(Math.min(720, Math.max(320, nextWidth)));
  }, []);

  return {
    activeTab,
    setActiveTab,
    setWidth: clampWidth,
    width,
  };
}
```

- [ ] **Step 5: Implement shell**

Create `src/flowCanvas/agent/CanvasAgentWorkspaceShell.tsx`:

```tsx
import React from "react";
import { PanelRightClose, Plus, Sparkles } from "lucide-react";

import type { AgentWorkspaceTab } from "./CanvasAgentWorkspaceTypes";
import { CanvasAgentTabs } from "./CanvasAgentTabs";

export function CanvasAgentWorkspaceShell(props: {
  activeTab: AgentWorkspaceTab;
  busy: boolean;
  children: React.ReactNode;
  onChangeTab: (tab: AgentWorkspaceTab) => void;
  onCollapse: () => void;
  onNewChat: () => void;
  width?: number;
}) {
  const width = props.width ?? 420;

  return (
    <aside
      className="nodrag nopan nowheel"
      style={{
        backdropFilter: "blur(18px)",
        background: "rgba(10,10,15,0.97)",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        bottom: 0,
        boxShadow: "-24px 0 70px rgba(0,0,0,0.38)",
        display: "grid",
        gridTemplateRows: "auto auto 1fr",
        overflow: "hidden",
        position: "absolute",
        right: 0,
        top: 0,
        width,
        zIndex: 80,
      }}
    >
      <header
        style={{
          alignItems: "center",
          display: "flex",
          gap: 12,
          justifyContent: "space-between",
          padding: "14px 14px 12px",
        }}
      >
        <div style={{ alignItems: "center", display: "flex", gap: 10 }}>
          <div
            style={{
              background: "linear-gradient(135deg, rgba(34,197,94,0.24), rgba(14,165,233,0.18))",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16,
              color: "#f8fafc",
              display: "grid",
              height: 34,
              placeItems: "center",
              width: 34,
            }}
          >
            <Sparkles size={17} />
          </div>
          <div>
            <div style={{ color: "#f8fafc", fontSize: 15, fontWeight: 900 }}>TapFlow Agent</div>
            <div style={{ color: "rgba(226,232,240,0.62)", fontSize: 12 }}>Canvas Director</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            aria-label="新对话"
            disabled={props.busy}
            onClick={props.onNewChat}
            style={iconButtonStyle(props.busy)}
            type="button"
          >
            <Plus size={16} />
          </button>
          <button aria-label="收起 Agent" onClick={props.onCollapse} style={iconButtonStyle(false)} type="button">
            <PanelRightClose size={16} />
          </button>
        </div>
      </header>
      <CanvasAgentTabs activeTab={props.activeTab} onChange={props.onChangeTab} />
      <div style={{ minHeight: 0, overflow: "hidden" }}>{props.children}</div>
    </aside>
  );
}

function iconButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    color: disabled ? "rgba(248,250,252,0.38)" : "#f8fafc",
    cursor: disabled ? "not-allowed" : "pointer",
    display: "grid",
    height: 34,
    placeItems: "center",
    width: 34,
  };
}
```

- [ ] **Step 6: Run shell tests**

Run:

```bash
npm test -- src/flowCanvas/agent/CanvasAgentWorkspaceShell.test.tsx src/flowCanvas/agent/CanvasAgentTabs.test.tsx
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/flowCanvas/agent/CanvasAgentWorkspaceShell.tsx src/flowCanvas/agent/CanvasAgentTabs.tsx src/flowCanvas/agent/useAgentWorkspacePanel.ts src/flowCanvas/agent/CanvasAgentWorkspaceShell.test.tsx src/flowCanvas/agent/CanvasAgentTabs.test.tsx
git commit -m "feat(agent): add docked workspace shell"
```

---

## Task 3: Add Conversation, History, Connection, And Log Views

**Files:**

- Create: `src/flowCanvas/agent/CanvasAgentConversationView.tsx`
- Create: `src/flowCanvas/agent/CanvasAgentHistoryView.tsx`
- Create: `src/flowCanvas/agent/CanvasAgentConnectionView.tsx`
- Create: `src/flowCanvas/agent/CanvasAgentLogView.tsx`
- Test: `src/flowCanvas/agent/CanvasAgentConversationView.test.tsx`
- Test: `src/flowCanvas/agent/CanvasAgentHistoryView.test.tsx`

- [ ] **Step 1: Write view tests**

Create `src/flowCanvas/agent/CanvasAgentConversationView.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentConversationView } from "./CanvasAgentConversationView";

describe("CanvasAgentConversationView", () => {
  it("renders the branded empty state when timeline is empty", () => {
    render(
      <CanvasAgentConversationView
        busy={false}
        items={[]}
        onApprove={vi.fn()}
        onCancel={vi.fn()}
        onContinueFromAsset={vi.fn()}
        onPlaceAssets={vi.fn()}
        onSelectAssetRef={vi.fn()}
      />,
    );

    expect(screen.getByText("TapFlow Agent")).toBeInTheDocument();
    expect(screen.getByText("One canvas, every production step")).toBeInTheDocument();
    expect(screen.getByText("生成一张动物运动会海报")).toBeInTheDocument();
  });
});
```

Create `src/flowCanvas/agent/CanvasAgentHistoryView.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentHistoryView } from "./CanvasAgentHistoryView";

describe("CanvasAgentHistoryView", () => {
  it("renders sessions and opens the selected session", () => {
    const onOpenSession = vi.fn();
    render(
      <CanvasAgentHistoryView
        activeSessionId="session-1"
        onNewChat={vi.fn()}
        onOpenSession={onOpenSession}
        sessions={[
          {
            createdAt: "2026-06-26T00:00:00.000Z",
            flowId: "flow-1",
            id: "session-1",
            projectId: "project-1",
            title: "动物运动会",
            updatedAt: "2026-06-26T00:00:00.000Z",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /动物运动会/ }));

    expect(onOpenSession).toHaveBeenCalledWith("session-1");
  });
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
npm test -- src/flowCanvas/agent/CanvasAgentConversationView.test.tsx src/flowCanvas/agent/CanvasAgentHistoryView.test.tsx
```

Expected: fail because components do not exist.

- [ ] **Step 3: Implement conversation view**

Create `src/flowCanvas/agent/CanvasAgentConversationView.tsx`:

```tsx
import React from "react";

import { CanvasAgentTimeline } from "./CanvasAgentTimeline";
import type { AgentWorkspaceTimelineItem } from "./CanvasAgentWorkspaceTypes";
import type { AgentImageRunSettingsSelection } from "./agentRunSettings";
import type { CanvasAgentContinuationAction, CanvasAgentToolAssetRef } from "./canvasAgentToolTypes";

export function CanvasAgentConversationView(props: {
  busy: boolean;
  items: AgentWorkspaceTimelineItem[];
  onApprove: (toolCallKey: string, selection?: AgentImageRunSettingsSelection) => void;
  onCancel: (toolCallKey: string) => void;
  onContinueFromAsset: (asset: CanvasAgentToolAssetRef, action: CanvasAgentContinuationAction, assets?: CanvasAgentToolAssetRef[]) => void;
  onPlaceAssets: (toolCallKey: string) => void;
  onSelectAssetRef: (toolCallKey: string, refId: string) => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateRows: "1fr", height: "100%", minHeight: 0 }}>
      <div style={{ minHeight: 0, overflowY: "auto", padding: 14 }}>
        {props.items.length === 0 ? <AgentEmptyState /> : (
          <CanvasAgentTimeline
            items={props.items}
            onApprove={props.onApprove}
            onCancel={props.onCancel}
            onContinueFromAsset={props.onContinueFromAsset}
            onPlaceAssets={props.onPlaceAssets}
            onSelectAssetRef={props.onSelectAssetRef}
          />
        )}
      </div>
    </div>
  );
}

function AgentEmptyState() {
  return (
    <section
      style={{
        alignItems: "center",
        color: "#f8fafc",
        display: "grid",
        gap: 14,
        minHeight: 360,
        placeItems: "center",
        textAlign: "center",
      }}
    >
      <div>
        <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1 }}>TapFlow Agent</div>
        <div style={{ color: "rgba(226,232,240,0.62)", fontSize: 14, marginTop: 8 }}>One canvas, every production step</div>
        <div style={{ display: "grid", gap: 8, marginTop: 22 }}>
          {["生成一张动物运动会海报", "把选中的图片做成三张风格变体", "基于刚才的结果继续做电商主图"].map((text) => (
            <div
              key={text}
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 999,
                color: "rgba(248,250,252,0.82)",
                fontSize: 12,
                padding: "8px 12px",
              }}
            >
              {text}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Implement history view**

Create `src/flowCanvas/agent/CanvasAgentHistoryView.tsx`:

```tsx
import React from "react";
import { Plus } from "lucide-react";

import type { AgentSessionView } from "./canvasAgentApi";

export function CanvasAgentHistoryView(props: {
  activeSessionId: string | null;
  onNewChat: () => void;
  onOpenSession: (sessionId: string) => void;
  sessions: AgentSessionView[];
}) {
  return (
    <div style={{ display: "grid", gap: 12, height: "100%", overflowY: "auto", padding: 14 }}>
      <button
        onClick={props.onNewChat}
        style={{
          alignItems: "center",
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 16,
          color: "#f8fafc",
          cursor: "pointer",
          display: "flex",
          fontSize: 13,
          fontWeight: 800,
          gap: 8,
          height: 40,
          justifyContent: "center",
        }}
        type="button"
      >
        <Plus size={15} />
        新对话
      </button>
      {props.sessions.length === 0 ? (
        <div style={{ color: "rgba(226,232,240,0.62)", fontSize: 13, lineHeight: 1.7, padding: 14 }}>
          当前项目还没有 Agent 对话。新建一次对话后，历史会在这里保存。
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {props.sessions.map((session) => {
            const active = session.id === props.activeSessionId;
            return (
              <button
                aria-label={`打开对话 ${session.title}`}
                key={session.id}
                onClick={() => props.onOpenSession(session.id)}
                style={{
                  background: active ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${active ? "rgba(34,197,94,0.28)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 16,
                  color: "#f8fafc",
                  cursor: "pointer",
                  display: "grid",
                  gap: 4,
                  padding: 12,
                  textAlign: "left",
                }}
                type="button"
              >
                <span style={{ fontSize: 13, fontWeight: 800 }}>{session.title || "未命名对话"}</span>
                <span style={{ color: "rgba(226,232,240,0.54)", fontSize: 11 }}>{session.updatedAt ?? session.createdAt}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Implement connection and log views**

Create `src/flowCanvas/agent/CanvasAgentConnectionView.tsx`:

```tsx
import React from "react";

import type { AgentImageRunSettingsModel } from "./agentRunSettings";

export function CanvasAgentConnectionView(props: { models: AgentImageRunSettingsModel[] }) {
  return (
    <div style={{ display: "grid", gap: 12, height: "100%", overflowY: "auto", padding: 14 }}>
      <div style={{ color: "#f8fafc", fontSize: 14, fontWeight: 900 }}>可用生产模型</div>
      {props.models.length === 0 ? (
        <div style={{ color: "rgba(226,232,240,0.62)", fontSize: 13 }}>当前没有可用图片模型，请先在模型中心启用正式线路。</div>
      ) : (
        props.models.map((model) => (
          <section
            key={model.modelKey}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16,
              display: "grid",
              gap: 8,
              padding: 12,
            }}
          >
            <div style={{ color: "#f8fafc", fontSize: 13, fontWeight: 800 }}>{model.displayName}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {model.routes.map((route) => (
                <span
                  key={route.routeKey}
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    borderRadius: 999,
                    color: "rgba(226,232,240,0.78)",
                    fontSize: 11,
                    padding: "5px 8px",
                  }}
                >
                  {route.routeLabel}
                </span>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
```

Create `src/flowCanvas/agent/CanvasAgentLogView.tsx`:

```tsx
import React from "react";

import type { CanvasAgentActivityItem } from "./CanvasAgentActivityTimeline";

export function CanvasAgentLogView(props: { activityItems: CanvasAgentActivityItem[]; error: string | null }) {
  return (
    <div style={{ display: "grid", gap: 10, height: "100%", overflowY: "auto", padding: 14 }}>
      <div style={{ color: "#f8fafc", fontSize: 14, fontWeight: 900 }}>排错日志</div>
      <div style={{ color: "rgba(226,232,240,0.56)", fontSize: 12, lineHeight: 1.6 }}>
        这里只显示用户安全的任务状态，不展示供应商、BaseUrl、密钥、上游模型或 Authorization 信息。
      </div>
      {props.error ? (
        <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.24)", borderRadius: 14, color: "#fecaca", fontSize: 12, padding: 10 }}>
          {props.error}
        </div>
      ) : null}
      {props.activityItems.map((item) => (
        <div key={item.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", color: "rgba(226,232,240,0.76)", fontSize: 12, padding: "8px 0" }}>
          <strong>{item.label}</strong>
          {item.detail ? <div style={{ marginTop: 4, opacity: 0.72 }}>{item.detail}</div> : null}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Run view tests**

Run:

```bash
npm test -- src/flowCanvas/agent/CanvasAgentConversationView.test.tsx src/flowCanvas/agent/CanvasAgentHistoryView.test.tsx
```

Expected: pass for the empty-state and history tests. Do not require non-empty timeline rendering in this task; Task 4 owns the unified timeline implementation.

- [ ] **Step 7: Commit**

```bash
git add src/flowCanvas/agent/CanvasAgentConversationView.tsx src/flowCanvas/agent/CanvasAgentHistoryView.tsx src/flowCanvas/agent/CanvasAgentConnectionView.tsx src/flowCanvas/agent/CanvasAgentLogView.tsx src/flowCanvas/agent/CanvasAgentConversationView.test.tsx src/flowCanvas/agent/CanvasAgentHistoryView.test.tsx
git commit -m "feat(agent): add workspace tab views"
```

---

## Task 4: Build Unified Timeline And Result Cards

**Files:**

- Create: `src/flowCanvas/agent/CanvasAgentTimeline.tsx`
- Create: `src/flowCanvas/agent/CanvasAgentTimelineItem.tsx`
- Create: `src/flowCanvas/agent/CanvasAgentResultCard.tsx`
- Test: `src/flowCanvas/agent/CanvasAgentTimeline.test.tsx`
- Test: `src/flowCanvas/agent/CanvasAgentResultCard.test.tsx`

- [ ] **Step 1: Write timeline and result card tests**

Create `src/flowCanvas/agent/CanvasAgentTimeline.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentTimeline } from "./CanvasAgentTimeline";

describe("CanvasAgentTimeline", () => {
  it("renders message, status, tool, result, and error items", () => {
    render(
      <CanvasAgentTimeline
        items={[
          { content: "生成一张海报", id: "m1", kind: "message", role: "user" },
          { id: "s1", kind: "status", state: "active", title: "正在理解需求" },
          { id: "t1", kind: "tool", status: "running", summary: "正在执行", title: "图片生成", toolCallKey: "tool-1" },
          { assets: [{ assetId: "asset-1", label: "结果 1", refId: "ref-1" }], id: "r1", kind: "result", toolCallKey: "tool-1" },
          { id: "e1", kind: "error", message: "失败", retryable: true, title: "任务失败" },
        ]}
        onApprove={vi.fn()}
        onCancel={vi.fn()}
        onContinueFromAsset={vi.fn()}
        onPlaceAssets={vi.fn()}
        onSelectAssetRef={vi.fn()}
      />,
    );

    expect(screen.getByText("生成一张海报")).toBeInTheDocument();
    expect(screen.getByText("正在理解需求")).toBeInTheDocument();
    expect(screen.getByText("图片生成")).toBeInTheDocument();
    expect(screen.getByText("结果 1")).toBeInTheDocument();
    expect(screen.getByText("任务失败")).toBeInTheDocument();
  });
});
```

Create `src/flowCanvas/agent/CanvasAgentResultCard.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentResultCard } from "./CanvasAgentResultCard";

describe("CanvasAgentResultCard", () => {
  it("shows result actions", () => {
    const onPlaceAssets = vi.fn();
    const onContinueFromAsset = vi.fn();
    render(
      <CanvasAgentResultCard
        assets={[{ assetId: "asset-1", label: "结果 1", refId: "ref-1" }]}
        onContinueFromAsset={onContinueFromAsset}
        onPlaceAssets={onPlaceAssets}
        toolCallKey="tool-1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "放入画布" }));
    fireEvent.click(screen.getByRole("button", { name: "继续编辑" }));

    expect(onPlaceAssets).toHaveBeenCalledWith("tool-1");
    expect(onContinueFromAsset).toHaveBeenCalledWith(
      { assetId: "asset-1", label: "结果 1", refId: "ref-1" },
      "continue-edit",
      [{ assetId: "asset-1", label: "结果 1", refId: "ref-1" }],
    );
  });
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
npm test -- src/flowCanvas/agent/CanvasAgentTimeline.test.tsx src/flowCanvas/agent/CanvasAgentResultCard.test.tsx
```

Expected: fail because components do not exist.

- [ ] **Step 3: Implement result card**

Create `src/flowCanvas/agent/CanvasAgentResultCard.tsx`:

```tsx
import React from "react";

import type { CanvasAgentContinuationAction, CanvasAgentToolAssetRef } from "./canvasAgentToolTypes";

export function CanvasAgentResultCard(props: {
  assets: CanvasAgentToolAssetRef[];
  onContinueFromAsset: (asset: CanvasAgentToolAssetRef, action: CanvasAgentContinuationAction, assets?: CanvasAgentToolAssetRef[]) => void;
  onPlaceAssets: (toolCallKey: string) => void;
  placedNodeIds?: string[];
  toolCallKey: string;
}) {
  const firstAsset = props.assets[0] ?? null;

  return (
    <article
      style={{
        background: "rgba(255,255,255,0.045)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 18,
        display: "grid",
        gap: 12,
        padding: 12,
      }}
    >
      <div style={{ color: "#f8fafc", fontSize: 13, fontWeight: 900 }}>生成结果</div>
      <div style={{ display: "grid", gap: 8 }}>
        {props.assets.map((asset) => (
          <div key={asset.refId} style={{ color: "rgba(226,232,240,0.78)", fontSize: 12 }}>
            {asset.label}
          </div>
        ))}
      </div>
      {props.placedNodeIds?.length ? (
        <div style={{ color: "#86efac", fontSize: 12, fontWeight: 800 }}>已放入画布</div>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button onClick={() => props.onPlaceAssets(props.toolCallKey)} style={actionStyle()} type="button">
          放入画布
        </button>
        {firstAsset ? (
          <>
            <button onClick={() => props.onContinueFromAsset(firstAsset, "continue-edit", props.assets)} style={actionStyle()} type="button">
              继续编辑
            </button>
            <button onClick={() => props.onContinueFromAsset(firstAsset, "make-variant", props.assets)} style={actionStyle()} type="button">
              做变体
            </button>
            <button onClick={() => props.onContinueFromAsset(firstAsset, "make-poster", props.assets)} style={actionStyle()} type="button">
              做海报
            </button>
            <button onClick={() => props.onContinueFromAsset(firstAsset, "compare", props.assets)} style={actionStyle()} type="button">
              生成对比图
            </button>
          </>
        ) : null}
      </div>
    </article>
  );
}

function actionStyle(): React.CSSProperties {
  return {
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 999,
    color: "#f8fafc",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 800,
    height: 30,
    padding: "0 10px",
  };
}
```

- [ ] **Step 4: Implement timeline item**

Create `src/flowCanvas/agent/CanvasAgentTimelineItem.tsx`:

```tsx
import React from "react";

import { CanvasAgentParameterCard } from "./CanvasAgentParameterCard";
import { CanvasAgentResultCard } from "./CanvasAgentResultCard";
import type { AgentWorkspaceTimelineItem } from "./CanvasAgentWorkspaceTypes";
import type { AgentImageRunSettingsSelection } from "./agentRunSettings";
import type { CanvasAgentContinuationAction, CanvasAgentToolAssetRef } from "./canvasAgentToolTypes";

export function CanvasAgentTimelineItem(props: {
  item: AgentWorkspaceTimelineItem;
  onApprove: (toolCallKey: string, selection?: AgentImageRunSettingsSelection) => void;
  onCancel: (toolCallKey: string) => void;
  onContinueFromAsset: (asset: CanvasAgentToolAssetRef, action: CanvasAgentContinuationAction, assets?: CanvasAgentToolAssetRef[]) => void;
  onPlaceAssets: (toolCallKey: string) => void;
  onSelectAssetRef: (toolCallKey: string, refId: string) => void;
}) {
  const item = props.item;

  if (item.kind === "message") {
    const user = item.role === "user";
    return (
      <div style={{ display: "flex", justifyContent: user ? "flex-end" : "flex-start" }}>
        <div
          style={{
            background: user ? "#f8fafc" : "rgba(255,255,255,0.06)",
            borderRadius: 18,
            color: user ? "#09090f" : "#f8fafc",
            fontSize: 13,
            lineHeight: 1.6,
            maxWidth: "88%",
            padding: "9px 12px",
            whiteSpace: "pre-wrap",
          }}
        >
          {item.content}
        </div>
      </div>
    );
  }

  if (item.kind === "status") {
    return (
      <div style={{ color: item.state === "failed" ? "#fecaca" : "rgba(226,232,240,0.78)", fontSize: 12 }}>
        <strong>{item.title}</strong>
        {item.detail ? <div style={{ marginTop: 4, opacity: 0.72 }}>{item.detail}</div> : null}
      </div>
    );
  }

  if (item.kind === "parameter") {
    return (
      <CanvasAgentParameterCard
        models={item.models}
        onCancel={() => props.onCancel(item.toolCallKey)}
        onConfirm={(selection) => props.onApprove(item.toolCallKey, selection)}
        referenceRefs={item.referenceRefs}
      />
    );
  }

  if (item.kind === "tool") {
    return (
      <article style={{ background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, display: "grid", gap: 6, padding: 12 }}>
        <div style={{ color: "#f8fafc", fontSize: 13, fontWeight: 900 }}>{item.title}</div>
        <div style={{ color: "rgba(226,232,240,0.68)", fontSize: 12, lineHeight: 1.6 }}>{item.summary}</div>
      </article>
    );
  }

  if (item.kind === "result") {
    return (
      <CanvasAgentResultCard
        assets={item.assets}
        onContinueFromAsset={props.onContinueFromAsset}
        onPlaceAssets={props.onPlaceAssets}
        placedNodeIds={item.placedNodeIds}
        toolCallKey={item.toolCallKey}
      />
    );
  }

  return (
    <article style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.24)", borderRadius: 18, color: "#fecaca", padding: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 900 }}>{item.title}</div>
      <div style={{ fontSize: 12, lineHeight: 1.6, marginTop: 6 }}>{item.message}</div>
    </article>
  );
}
```

- [ ] **Step 5: Implement timeline list**

Create `src/flowCanvas/agent/CanvasAgentTimeline.tsx`:

```tsx
import React from "react";

import { CanvasAgentTimelineItem } from "./CanvasAgentTimelineItem";
import type { AgentWorkspaceTimelineItem } from "./CanvasAgentWorkspaceTypes";
import type { AgentImageRunSettingsSelection } from "./agentRunSettings";
import type { CanvasAgentContinuationAction, CanvasAgentToolAssetRef } from "./canvasAgentToolTypes";

export function CanvasAgentTimeline(props: {
  items: AgentWorkspaceTimelineItem[];
  onApprove: (toolCallKey: string, selection?: AgentImageRunSettingsSelection) => void;
  onCancel: (toolCallKey: string) => void;
  onContinueFromAsset: (asset: CanvasAgentToolAssetRef, action: CanvasAgentContinuationAction, assets?: CanvasAgentToolAssetRef[]) => void;
  onPlaceAssets: (toolCallKey: string) => void;
  onSelectAssetRef: (toolCallKey: string, refId: string) => void;
}) {
  return (
    <section aria-label="Agent conversation timeline" style={{ display: "grid", gap: 12 }}>
      {props.items.map((item) => (
        <CanvasAgentTimelineItem
          item={item}
          key={item.id}
          onApprove={props.onApprove}
          onCancel={props.onCancel}
          onContinueFromAsset={props.onContinueFromAsset}
          onPlaceAssets={props.onPlaceAssets}
          onSelectAssetRef={props.onSelectAssetRef}
        />
      ))}
    </section>
  );
}
```

- [ ] **Step 6: Run timeline tests**

Run:

```bash
npm test -- src/flowCanvas/agent/CanvasAgentTimeline.test.tsx src/flowCanvas/agent/CanvasAgentResultCard.test.tsx src/flowCanvas/agent/CanvasAgentConversationView.test.tsx
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/flowCanvas/agent/CanvasAgentTimeline.tsx src/flowCanvas/agent/CanvasAgentTimelineItem.tsx src/flowCanvas/agent/CanvasAgentResultCard.tsx src/flowCanvas/agent/CanvasAgentTimeline.test.tsx src/flowCanvas/agent/CanvasAgentResultCard.test.tsx
git commit -m "feat(agent): add unified workspace timeline"
```

---

## Task 5: Rebuild Composer With References, Model Route Picker, Parameters, And Credits

**Files:**

- Create: `src/flowCanvas/agent/CanvasAgentReferenceChips.tsx`
- Create: `src/flowCanvas/agent/CanvasAgentModelRoutePicker.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentComposer.tsx`
- Test: `src/flowCanvas/agent/CanvasAgentComposer.test.tsx`
- Test: `src/flowCanvas/agent/CanvasAgentModelRoutePicker.test.tsx`

- [ ] **Step 1: Write picker tests**

Create `src/flowCanvas/agent/CanvasAgentModelRoutePicker.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasAgentModelRoutePicker } from "./CanvasAgentModelRoutePicker";

const models = [
  {
    aspectRatios: ["1:1"],
    defaultRouteKey: "image.internal.route",
    displayName: "Nano Banana Pro",
    modelKey: "nano-banana-pro",
    quantityOptions: [1],
    routes: [
      {
        routeKey: "image.internal.route",
        routeLabel: "线路二",
        tiers: [{ credits: 8, size: "2K" as const }],
      },
    ],
    sizes: ["2K" as const],
  },
];

describe("CanvasAgentModelRoutePicker", () => {
  it("shows product model and route labels without raw route keys", () => {
    render(<CanvasAgentModelRoutePicker models={models} routeKey="image.internal.route" onChangeRoute={vi.fn()} />);

    expect(screen.getByText("Nano Banana Pro 线路二")).toBeInTheDocument();
    expect(screen.queryByText("image.internal.route")).not.toBeInTheDocument();
  });

  it("selects a route", () => {
    const onChangeRoute = vi.fn();
    render(<CanvasAgentModelRoutePicker models={models} routeKey="" onChangeRoute={onChangeRoute} />);

    fireEvent.click(screen.getByRole("button", { name: "Nano Banana Pro 线路二" }));

    expect(onChangeRoute).toHaveBeenCalledWith("image.internal.route");
  });
});
```

- [ ] **Step 2: Update composer tests**

Update `src/flowCanvas/agent/CanvasAgentComposer.test.tsx` to include:

```tsx
it("renders reference chips, friendly model route, credits, and send action", () => {
  const onSend = vi.fn();
  render(
    <CanvasAgentComposer
      disabled={false}
      estimatedCredits={8}
      imageModels={[
        {
          aspectRatios: ["1:1"],
          defaultRouteKey: "image.internal.route",
          displayName: "Nano Banana Pro",
          modelKey: "nano-banana-pro",
          quantityOptions: [1],
          routes: [{ routeKey: "image.internal.route", routeLabel: "线路二", tiers: [{ credits: 8, size: "2K" }] }],
          sizes: ["2K"],
        },
      ]}
      onChangeDraft={vi.fn()}
      onChangeRouteKey={vi.fn()}
      onSend={onSend}
      referenceChips={[{ id: "ref-1", kind: "artifact", label: "上一轮结果 1", assetId: "asset-1" }]}
      routeKey="image.internal.route"
    />,
  );

  expect(screen.getByText("上一轮结果 1")).toBeInTheDocument();
  expect(screen.getByText("Nano Banana Pro 线路二")).toBeInTheDocument();
  expect(screen.getByText("8")).toBeInTheDocument();
  expect(screen.queryByText("image.internal.route")).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run failing tests**

Run:

```bash
npm test -- src/flowCanvas/agent/CanvasAgentComposer.test.tsx src/flowCanvas/agent/CanvasAgentModelRoutePicker.test.tsx
```

Expected: fail until composer and picker are implemented.

- [ ] **Step 4: Implement reference chips**

Create `src/flowCanvas/agent/CanvasAgentReferenceChips.tsx`:

```tsx
import React from "react";

import type { AgentReferenceChip } from "./CanvasAgentWorkspaceTypes";

export function CanvasAgentReferenceChips(props: {
  chips: AgentReferenceChip[];
  onRemove?: (id: string) => void;
}) {
  if (props.chips.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {props.chips.map((chip) => (
        <span
          key={chip.id}
          style={{
            alignItems: "center",
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 999,
            color: "#f8fafc",
            display: "inline-flex",
            fontSize: 11,
            fontWeight: 800,
            gap: 6,
            minHeight: 28,
            padding: "0 8px",
          }}
        >
          {chip.previewUrl ? <img alt="" src={chip.previewUrl} style={{ borderRadius: 999, height: 20, objectFit: "cover", width: 20 }} /> : null}
          {chip.label}
          {props.onRemove ? (
            <button
              aria-label={`移除 ${chip.label}`}
              onClick={() => props.onRemove?.(chip.id)}
              style={{ background: "transparent", border: 0, color: "inherit", cursor: "pointer", padding: 0 }}
              type="button"
            >
              ×
            </button>
          ) : null}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Implement model route picker**

Create `src/flowCanvas/agent/CanvasAgentModelRoutePicker.tsx`:

```tsx
import React from "react";

import type { AgentImageRunSettingsModel } from "./agentRunSettings";

export function CanvasAgentModelRoutePicker(props: {
  models: AgentImageRunSettingsModel[];
  onChangeRoute: (routeKey: string) => void;
  routeKey: string;
}) {
  const options = props.models.flatMap((model) =>
    model.routes.map((route) => ({
      label: `${model.displayName} ${route.routeLabel}`,
      routeKey: route.routeKey,
    })),
  );
  const active = options.find((option) => option.routeKey === props.routeKey) ?? options[0] ?? null;

  if (!active) {
    return <span style={{ color: "rgba(226,232,240,0.58)", fontSize: 12 }}>暂无可用线路</span>;
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map((option) => (
        <button
          aria-label={option.label}
          aria-pressed={option.routeKey === props.routeKey}
          key={option.routeKey}
          onClick={() => props.onChangeRoute(option.routeKey)}
          style={{
            background: option.routeKey === props.routeKey ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 999,
            color: "#f8fafc",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 800,
            height: 30,
            maxWidth: 220,
            overflow: "hidden",
            padding: "0 10px",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={option.label}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Replace composer UI**

Modify `src/flowCanvas/agent/CanvasAgentComposer.tsx` so it accepts these additional optional props while remaining backward compatible:

```ts
estimatedCredits?: number | null;
imageModels?: AgentImageRunSettingsModel[];
onChangeRouteKey?: (routeKey: string) => void;
onRemoveReference?: (id: string) => void;
referenceChips?: AgentReferenceChip[];
routeKey?: string;
```

The rendered composer must include:

- `CanvasAgentReferenceChips`
- textarea
- `CanvasAgentModelRoutePicker` when `imageModels` exists
- credit pill when `estimatedCredits` exists
- send button

Keep `onSend(prompt)` behavior exactly the same so existing session logic remains valid.

- [ ] **Step 7: Run composer tests**

Run:

```bash
npm test -- src/flowCanvas/agent/CanvasAgentComposer.test.tsx src/flowCanvas/agent/CanvasAgentModelRoutePicker.test.tsx
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add src/flowCanvas/agent/CanvasAgentReferenceChips.tsx src/flowCanvas/agent/CanvasAgentModelRoutePicker.tsx src/flowCanvas/agent/CanvasAgentComposer.tsx src/flowCanvas/agent/CanvasAgentComposer.test.tsx src/flowCanvas/agent/CanvasAgentModelRoutePicker.test.tsx
git commit -m "feat(agent): rebuild production composer"
```

---

## Task 6: Wire New Workspace Into CanvasAgentPanel

**Files:**

- Modify: `src/flowCanvas/agent/CanvasAgentPanel.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentPanel.test.tsx`

- [ ] **Step 1: Update panel tests**

Update `src/flowCanvas/agent/CanvasAgentPanel.test.tsx` to assert:

```tsx
expect(screen.getByText("TapFlow Agent")).toBeInTheDocument();
expect(screen.getByText("Canvas Director")).toBeInTheDocument();
expect(screen.getByRole("tab", { name: "对话" })).toBeInTheDocument();
expect(screen.getByRole("tab", { name: "历史" })).toBeInTheDocument();
expect(screen.queryByText("Director Runtime (preview)")).not.toBeInTheDocument();
expect(screen.queryByText("Replay Events")).not.toBeInTheDocument();
expect(screen.queryByText("Classic Agent")).not.toBeInTheDocument();
```

- [ ] **Step 2: Run failing panel tests**

Run:

```bash
npm test -- src/flowCanvas/agent/CanvasAgentPanel.test.tsx
```

Expected: fail because current panel still renders old shell/copy.

- [ ] **Step 3: Refactor imports**

In `src/flowCanvas/agent/CanvasAgentPanel.tsx`, remove direct imports for:

```ts
CanvasAgentActivityTimeline
CanvasAgentToolTimeline
CanvasAgentConversationList
```

Add imports:

```ts
import { buildAgentWorkspaceTimeline } from "./agentWorkspaceTimeline";
import { CanvasAgentWorkspaceShell } from "./CanvasAgentWorkspaceShell";
import { CanvasAgentConversationView } from "./CanvasAgentConversationView";
import { CanvasAgentHistoryView } from "./CanvasAgentHistoryView";
import { CanvasAgentConnectionView } from "./CanvasAgentConnectionView";
import { CanvasAgentLogView } from "./CanvasAgentLogView";
import { useAgentWorkspacePanel } from "./useAgentWorkspacePanel";
```

- [ ] **Step 4: Compute timeline**

Inside `CanvasAgentPanel`, compute:

```ts
const workspace = useAgentWorkspacePanel();
const timelineItems = React.useMemo(
  () => buildAgentWorkspaceTimeline({
    activityItems: sessionActions.activityTimeline ?? [],
    error: sessionActions.error,
    messages: directorEnabled && history.messages.length > 0 ? history.messages.map((message) => ({
      content: message.content,
      id: message.id,
      metadata: message.metadata,
      role: message.role,
    })) : sessionActions.messages,
    toolItems: sessionActions.toolTimeline,
  }),
  [directorEnabled, history.messages, sessionActions.activityTimeline, sessionActions.error, sessionActions.messages, sessionActions.toolTimeline],
);
```

- [ ] **Step 5: Replace shell rendering**

Replace the current `<aside>` body with:

```tsx
<CanvasAgentWorkspaceShell
  activeTab={workspace.activeTab}
  busy={busy}
  onChangeTab={workspace.setActiveTab}
  onCollapse={props.onClose}
  onNewChat={() => {
    sessionActions.setSessionId?.(null);
    workspace.setActiveTab("chat");
  }}
  width={workspace.width}
>
  {workspace.activeTab === "chat" ? (
    <div style={{ display: "grid", gridTemplateRows: "1fr auto", height: "100%", minHeight: 0 }}>
      <CanvasAgentConversationView
        busy={busy}
        items={timelineItems}
        onApprove={sessionActions.approveToolCall}
        onCancel={sessionActions.cancelToolCall}
        onContinueFromAsset={(asset, action, assets) => {
          const selectedAssets = assets && assets.length > 0 ? assets : [asset];
          const continuation = {
            action,
            assetId: asset.assetId,
            assetIds: selectedAssets.map((item) => item.assetId),
            assetLabel: asset.label,
            assetLabels: selectedAssets.map((item) => item.label),
            assetRefId: asset.refId,
            assetRefIds: selectedAssets.map((item) => item.refId),
          };
          setComposerDraft(buildContinuationPrompt(asset, action, selectedAssets));
          sessionActions.setPendingContinuation?.(continuation);
        }}
        onPlaceAssets={sessionActions.placeToolAssetsOnCanvas}
        onSelectAssetRef={sessionActions.selectToolAssetRef}
      />
      <CanvasAgentComposer
        disabled={busy}
        draftValue={composerDraft}
        onChangeDraft={setComposerDraft}
        onSend={async (prompt) => {
          setComposerDraft("");
          await sessionActions.sendPrompt(prompt);
        }}
      />
    </div>
  ) : null}
  {workspace.activeTab === "history" ? (
    <CanvasAgentHistoryView
      activeSessionId={sessionActions.sessionId}
      onNewChat={() => {
        sessionActions.setSessionId?.(null);
        workspace.setActiveTab("chat");
      }}
      onOpenSession={(sessionId) => {
        sessionActions.setSessionId?.(sessionId);
        workspace.setActiveTab("chat");
      }}
      sessions={sessionList}
    />
  ) : null}
  {workspace.activeTab === "connections" ? (
    <CanvasAgentConnectionView models={sessionActions.toolTimeline.flatMap((item) => item.estimate?.imageRunSettings ?? [])} />
  ) : null}
  {workspace.activeTab === "logs" ? (
    <CanvasAgentLogView activityItems={sessionActions.activityTimeline ?? []} error={sessionActions.error} />
  ) : null}
</CanvasAgentWorkspaceShell>
```

- [ ] **Step 6: Preserve plan-card fallback only if needed**

If `currentPlan` remains necessary for non-executor planning mode, render it inside the unified conversation area as a temporary item. Do not place it as a separate debug section below the timeline.

- [ ] **Step 7: Run panel tests**

Run:

```bash
npm test -- src/flowCanvas/agent/CanvasAgentPanel.test.tsx
```

Expected: pass after updating expected copy.

- [ ] **Step 8: Commit**

```bash
git add src/flowCanvas/agent/CanvasAgentPanel.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx
git commit -m "feat(agent): wire workspace shell into panel"
```

---

## Task 7: Add Selected Canvas References To Composer

**Files:**

- Modify: `src/flowCanvas/agent/useCanvasAgentSession.ts`
- Modify: `src/flowCanvas/agent/CanvasAgentPanel.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentComposer.tsx`
- Test: `src/flowCanvas/agent/CanvasAgentComposer.test.tsx`
- Test: `src/flowCanvas/agent/useCanvasAgentSession.test.tsx`

- [ ] **Step 1: Write selected reference tests**

Add a composer test that renders:

```tsx
referenceChips={[
  { id: "node-1", kind: "canvas_node", label: "选中图片 1", nodeId: "node-1", assetId: "asset-1" },
]}
```

Assert:

```ts
expect(screen.getByText("选中图片 1")).toBeInTheDocument();
```

- [ ] **Step 2: Create selected reference helper**

Add helper in `src/flowCanvas/agent/useCanvasAgentSession.ts` or a new small helper file:

```ts
function buildSelectedCanvasReferenceChips(): AgentReferenceChip[] {
  const state = useFlowCanvasStore.getState();
  return state.nodes
    .filter((node) => node.selected)
    .map((node, index) => {
      const kind = node.data.kind;
      const label = kind === "image" ? `选中图片 ${index + 1}` : kind === "text" ? `画布文本 ${index + 1}` : `选中素材 ${index + 1}`;
      return {
        assetId: typeof node.data.assetId === "string" ? node.data.assetId : undefined,
        id: node.id,
        kind: "canvas_node",
        label,
        nodeId: node.id,
      };
    });
}
```

- [ ] **Step 3: Pass chips into composer**

In `CanvasAgentPanel.tsx`, compute selected node chips and merge with continuation chips.

Use labels:

```txt
选中图片 1
画布文本 1
上一轮结果 1
```

- [ ] **Step 4: Ensure no old prompt is pulled from upstream image nodes**

Verify current logic only passes asset/node/ref identity. Do not read upstream image node `generationPrompt` as the current prompt.

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- src/flowCanvas/agent/CanvasAgentComposer.test.tsx src/flowCanvas/agent/useCanvasAgentSession.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/flowCanvas/agent/useCanvasAgentSession.ts src/flowCanvas/agent/CanvasAgentPanel.tsx src/flowCanvas/agent/CanvasAgentComposer.tsx src/flowCanvas/agent/CanvasAgentComposer.test.tsx src/flowCanvas/agent/useCanvasAgentSession.test.tsx
git commit -m "feat(agent): surface canvas references in composer"
```

---

## Task 8: Polish Parameter Card And Model Labels

**Files:**

- Modify: `src/flowCanvas/agent/CanvasAgentParameterCard.tsx`
- Modify: `src/flowCanvas/agent/agentRunSettings.ts`
- Test: `src/flowCanvas/agent/CanvasAgentParameterCard.test.tsx`

- [ ] **Step 1: Add anti-leak test**

Update `CanvasAgentParameterCard.test.tsx`:

```tsx
expect(screen.getByText("Nano Banana Pro")).toBeInTheDocument();
expect(screen.getByText("线路二")).toBeInTheDocument();
expect(screen.queryByText(/image\./)).not.toBeInTheDocument();
expect(screen.queryByText(/provider/i)).not.toBeInTheDocument();
expect(screen.queryByText(/baseUrl/i)).not.toBeInTheDocument();
expect(screen.queryByText(/upstream/i)).not.toBeInTheDocument();
```

- [ ] **Step 2: Rewrite garbled/user-facing copy**

In `CanvasAgentParameterCard.tsx`, replace mojibake/unclear labels with:

```txt
生成前确认模型、线路与参数
模型
线路
参考素材
数量
预计积分
取消
确认生成
```

- [ ] **Step 3: Keep route key internal only**

Confirm rendered JSX never displays `route.routeKey`.

- [ ] **Step 4: Run parameter tests**

Run:

```bash
npm test -- src/flowCanvas/agent/CanvasAgentParameterCard.test.tsx
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/flowCanvas/agent/CanvasAgentParameterCard.tsx src/flowCanvas/agent/CanvasAgentParameterCard.test.tsx src/flowCanvas/agent/agentRunSettings.ts
git commit -m "fix(agent): polish parameter card labels"
```

---

## Task 9: Hide Debug/Internal Strings From Normal UI

**Files:**

- Modify: `src/flowCanvas/agent/CanvasAgentPanel.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentToolCard.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentTaskCard.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentThread.tsx`
- Test: `src/flowCanvas/agent/CanvasAgentPanel.test.tsx`
- Test: `src/flowCanvas/agent/CanvasAgentTimeline.test.tsx`

- [ ] **Step 1: Add forbidden-copy tests**

Add a test helper array:

```ts
const forbiddenCreatorCopy = [
  "Director Runtime (preview)",
  "Classic Agent",
  "Replay Events",
  "turn_failed",
  "workflow_run_linked",
  "route_key",
  "provider_key",
  "upstream_model",
  "baseUrl",
  "adapter_kind",
];
```

Assert each string is absent from normal `CanvasAgentPanel` render.

- [ ] **Step 2: Replace internal labels**

Replace normal UI labels with:

```txt
Agent 正在规划
等待你确认
正在生成
生成完成
生成失败
已放入画布
```

- [ ] **Step 3: Keep safe details only in log tab**

If a raw event or internal status is still useful, show it only in `CanvasAgentLogView` after redacting forbidden strings.

- [ ] **Step 4: Run anti-leak tests**

Run:

```bash
npm test -- src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/CanvasAgentTimeline.test.tsx
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/flowCanvas/agent/CanvasAgentPanel.tsx src/flowCanvas/agent/CanvasAgentToolCard.tsx src/flowCanvas/agent/CanvasAgentTaskCard.tsx src/flowCanvas/agent/CanvasAgentThread.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/CanvasAgentTimeline.test.tsx
git commit -m "fix(agent): hide internal runtime labels from creator ui"
```

---

## Task 10: Add Optional Session Delete API If History UX Needs It

**Files:**

- Modify: `apps/api/src/modules/agent/agent.routes.ts`
- Modify: `apps/api/src/modules/agent/agent.schemas.ts`
- Modify: `apps/api/src/modules/agent/agent.service.ts`
- Modify: `src/flowCanvas/agent/canvasAgentApi.ts`
- Modify: `src/flowCanvas/agent/CanvasAgentHistoryView.tsx`
- Test: `apps/api/test/agent.test.ts`
- Test: `src/flowCanvas/agent/CanvasAgentHistoryView.test.tsx`

This task is optional for the first UI release. Execute it only if the history tab includes delete controls.

- [ ] **Step 1: Add backend test**

Add an API test that:

- creates two sessions in one tenant
- deletes one session
- confirms it no longer appears in `GET /api/v2/agent/sessions`
- confirms another tenant cannot delete it

- [ ] **Step 2: Add route**

Add:

```txt
DELETE /api/v2/agent/sessions/:sessionId
```

Use `requirePermission("flow:update")`.

- [ ] **Step 3: Implement service method**

Delete only the session owned by the current tenant. Let FK cascade remove messages/events/tasks if database constraints support it. If not, delete child rows first inside a transaction.

- [ ] **Step 4: Add frontend API**

Add to `canvasAgentApi.ts`:

```ts
export function deleteAgentSession(sessionId: string) {
  return apiDelete<{ ok: true }>(`/agent/sessions/${sessionId}`);
}
```

If `apiDelete` does not exist, add it to `src/services/v2HttpClient.ts` with the same auth behavior as `apiGet` and `apiPost`.

- [ ] **Step 5: Add history delete control**

Add a small delete button on each history row with a confirmation prompt.

- [ ] **Step 6: Run tests**

Run:

```bash
npm run test --workspace @aigc-flow/api -- agent.test.ts
npm test -- src/flowCanvas/agent/CanvasAgentHistoryView.test.tsx
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/agent/agent.routes.ts apps/api/src/modules/agent/agent.schemas.ts apps/api/src/modules/agent/agent.service.ts src/flowCanvas/agent/canvasAgentApi.ts src/flowCanvas/agent/CanvasAgentHistoryView.tsx apps/api/test/agent.test.ts src/flowCanvas/agent/CanvasAgentHistoryView.test.tsx
git commit -m "feat(agent): allow deleting workspace sessions"
```

---

## Task 11: Integration Test The Full Workspace Panel

**Files:**

- Modify: `src/flowCanvas/agent/CanvasAgentIntegration.test.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentPanel.test.tsx`

- [ ] **Step 1: Add integration test for a normal production turn**

Update `CanvasAgentIntegration.test.tsx` to verify:

- panel opens
- empty state appears
- user prompt sends
- status appears
- parameter card appears
- confirmation calls `approveToolCall`
- result card appears when a successful tool event is applied
- place-on-canvas action calls `placeToolAssetsOnCanvas`

- [ ] **Step 2: Add refresh/replay test**

Simulate history messages + event stream data and assert the same unified timeline is rendered after hydration.

- [ ] **Step 3: Run Agent frontend test set**

Run:

```bash
npm test -- src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/CanvasAgentIntegration.test.tsx src/flowCanvas/agent/agentWorkspaceTimeline.test.ts src/flowCanvas/agent/CanvasAgentComposer.test.tsx src/flowCanvas/agent/CanvasAgentTimeline.test.tsx src/flowCanvas/agent/CanvasAgentResultCard.test.tsx src/flowCanvas/agent/CanvasAgentParameterCard.test.tsx
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/flowCanvas/agent/CanvasAgentIntegration.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx
git commit -m "test(agent): cover workspace production flow"
```

---

## Task 12: Manual UI Verification In Local Browser

**Files:**

- No source file required unless verification finds issues.

- [ ] **Step 1: Start local app**

Run in separate terminals as needed:

```bash
npm run dev:infra
npm run db:migrate
npm run dev:api
npm run dev:worker
npm run dev
```

- [ ] **Step 2: Open local canvas**

Open:

```txt
http://localhost:5188/workspace
```

Then open an existing project canvas.

- [ ] **Step 3: Verify Agent panel**

Check:

- docked right panel
- `对话 / 历史 / 连接配置 / 日志` tabs
- no debug labels in normal UI
- composer visible without scrolling
- reference chips appear when selecting an image node
- model/route labels are friendly
- route keys and provider internals are hidden

- [ ] **Step 4: Verify production flow**

Run:

```txt
生成一张动物运动会海报，3D风格
```

Confirm:

- visible progress starts quickly
- parameter confirmation appears
- credit estimate is visible
- generation result card appears
- result can be placed on canvas
- refresh restores the conversation

- [ ] **Step 5: Record issues**

If issues appear, fix them in focused commits with tests.

---

## Task 13: Build, Backend Tests, And Project Record

**Files:**

- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Run focused frontend tests**

Run:

```bash
npm test -- src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/CanvasAgentIntegration.test.tsx src/flowCanvas/agent/agentWorkspaceTimeline.test.ts src/flowCanvas/agent/CanvasAgentComposer.test.tsx src/flowCanvas/agent/CanvasAgentTimeline.test.tsx src/flowCanvas/agent/CanvasAgentResultCard.test.tsx src/flowCanvas/agent/CanvasAgentParameterCard.test.tsx src/flowCanvas/agent/CanvasAgentHistoryView.test.tsx
```

Expected: pass.

- [ ] **Step 2: Run backend Agent tests if backend changed**

If Task 10 or other backend changes were made, run:

```bash
npm run test --workspace @aigc-flow/api -- agent.test.ts agent-run-settings.test.ts agent-event-service.test.ts agent-tool-runner.test.ts
```

Expected: pass, or document missing local DB infra.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: pass. Existing Vite chunk-size warnings are acceptable.

- [ ] **Step 4: Update project record**

Add a new entry to `PROJECT_RECORD.md`:

```md
## 2026-06-26 - Agent Workspace V2 Redesign

- rebuilt the Agent frontend as a right-side production workspace inspired by infinite-canvas while preserving TapFlow v2 server-side execution.
- added a unified user-facing timeline for messages, progress, parameter confirmation, tool execution, result cards, and errors.
- replaced debug-style Agent panel copy with creator-facing production states.
- added production composer surfaces for references, friendly model/line selection, and credit visibility.
- kept provider internals, route keys, base URLs, upstream model names, and credentials out of normal creator UI.
- validation:
  - `npm test -- src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/CanvasAgentIntegration.test.tsx src/flowCanvas/agent/agentWorkspaceTimeline.test.ts src/flowCanvas/agent/CanvasAgentComposer.test.tsx src/flowCanvas/agent/CanvasAgentTimeline.test.tsx src/flowCanvas/agent/CanvasAgentResultCard.test.tsx src/flowCanvas/agent/CanvasAgentParameterCard.test.tsx src/flowCanvas/agent/CanvasAgentHistoryView.test.tsx` passed
  - `npm run build` passed
```

- [ ] **Step 5: Commit verification docs**

```bash
git add PROJECT_RECORD.md
git commit -m "docs(agent): record workspace v2 redesign"
```

---

## Task 14: Final Push

**Files:**

- All files changed by completed tasks.

- [ ] **Step 1: Inspect git status**

Run:

```bash
git status --short --branch
```

Expected: only intended Agent/docs files are changed or no changes remain after commits.

- [ ] **Step 2: Run final build if not already run after the last code change**

Run:

```bash
npm run build
```

Expected: pass.

- [ ] **Step 3: Push current branch**

Run:

```bash
git push origin HEAD
```

Expected: push succeeds.

- [ ] **Step 4: Report**

Report:

- branch name
- commit hashes
- tests run
- build result
- known follow-ups

---

## Acceptance Checklist

- [ ] Agent opens as a stable docked right panel.
- [ ] Agent panel supports collapse.
- [ ] Agent panel has `对话`, `历史`, `连接配置`, and `日志` tabs.
- [ ] Normal UI does not show `Director Runtime (preview)`, `Classic Agent`, `Replay Events`, raw event names, provider keys, base URLs, upstream models, or route keys.
- [ ] Composer shows references, model/line picker, credits, and send button.
- [ ] Selected canvas nodes appear as reference chips.
- [ ] Previous result refs appear as continuation chips.
- [ ] Parameter card shows product model, route label, size, quantity, and credits.
- [ ] Timeline shows one coherent production story.
- [ ] Result cards support placing on canvas and continuing from output.
- [ ] History tab shows project/flow-scoped conversations.
- [ ] Refresh/replay restores the same user-facing timeline.
- [ ] `npm run build` passes.
- [ ] Relevant Agent frontend tests pass.
- [ ] Backend Agent tests pass if backend was touched.
- [ ] `PROJECT_RECORD.md` is updated.

## Execution Recommendation

Use subagent-driven development for Tasks 1-11 because most tasks are isolated frontend slices with clear tests. Use inline execution for Task 12 manual browser verification because it requires one continuous UI session.

The first implementation pass should not add long-term memory, MCP, multi-agent orchestration, or automatic model installation. Those remain later phases after the Agent Workspace V2 production loop is good.
