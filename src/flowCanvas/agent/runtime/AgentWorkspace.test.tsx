import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentWorkspace } from "./AgentWorkspace";

const base = { contextSnapshot: { projectId: null, flowId: null, graphRevision: 0, refs: [], skillIds: [], appIds: [], modelKey: null }, executionState: "idle" as const, graphRevision: 0, pendingDecision: null, replayCursor: null, stateVersion: 1 };

describe("canonical AgentWorkspace conversation stream", () => {
  it("renders turns in order instead of only the latest response", () => {
    render(<AgentWorkspace session={{ id: "s", title: "历史", projectId: null, flowId: null, mode: "manual_confirmation" }} response={null} turns={[
      { ...base, sessionId: "s", turnId: "t1", phase: "understanding", blocks: [{ type: "understanding", id: "u", text: "理解目标" }] },
      { ...base, sessionId: "s", turnId: "t2", phase: "waiting_for_confirmation", blocks: [{ type: "plan", id: "p", summary: "计划", deliverables: [] }, { type: "confirmation", id: "c", text: "确认" }] },
    ]} onNewConversation={() => undefined} onOpenSession={() => undefined} onSubmitTurn={async () => undefined} onDecision={async () => undefined} />);
    expect(screen.getByText("理解目标")).toBeTruthy();
    expect(screen.getAllByText("计划").length).toBeGreaterThan(0);
    expect(screen.getAllByText("确认").length).toBeGreaterThan(0);
  });
});
