import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import FlowCanvasPage from "./FlowCanvasPage";
import { useFlowCanvasStore } from "./store/flowCanvasStore";

vi.mock("@xyflow/react", () => ({
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useReactFlow: () => ({
    screenToFlowPosition: (position: { x: number; y: number }) => position,
  }),
}));

vi.mock("./canvas/AiFlowCanvas", () => ({
  AiFlowCanvas: ({ onAgentOpenChange }: { onAgentOpenChange?: (open: boolean) => void }) => (
    <div>
      <div data-testid="canvas-surface" />
      <button onClick={() => onAgentOpenChange?.(true)} type="button">
        打开 Agent
      </button>
      <button onClick={() => onAgentOpenChange?.(false)} type="button">
        关闭 Agent
      </button>
    </div>
  ),
}));

vi.mock("./canvas/FlowTopToolbar", () => ({
  FlowTopToolbar: ({ hideUtilityActions }: { hideUtilityActions?: boolean }) => (
    <div data-testid="flow-top-toolbar" data-hide-utility-actions={hideUtilityActions ? "yes" : "no"} />
  ),
}));

describe("FlowCanvasPage", () => {
  beforeEach(() => {
    useFlowCanvasStore.setState({ edges: [], nodes: [] });
  });

  test("renders the Phase 3 TapNow-style empty canvas start surface", () => {
    render(<FlowCanvasPage />);

    expect(screen.getByText("今天想创作什么？")).toBeTruthy();
    expect(screen.getByText("从一个节点开始，或打开模板快速搭建你的 AI Flow。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "文生视频" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "图片生成" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "打开模板" })).toBeTruthy();
  });

  test("hides top-right utility actions while the Agent panel is open", () => {
    render(<FlowCanvasPage />);

    expect(screen.getByTestId("flow-top-toolbar").getAttribute("data-hide-utility-actions")).toBe("no");

    fireEvent.click(screen.getByRole("button", { name: "打开 Agent" }));
    expect(screen.getByTestId("flow-top-toolbar").getAttribute("data-hide-utility-actions")).toBe("yes");

    fireEvent.click(screen.getByRole("button", { name: "关闭 Agent" }));
    expect(screen.getByTestId("flow-top-toolbar").getAttribute("data-hide-utility-actions")).toBe("no");
  });

  test.each([
    ['contenteditable', () => {
      const element = document.createElement('div');
      element.setAttribute('contenteditable', 'true');
      return element;
    }],
    ['combobox descendant', () => {
      const element = document.createElement('div');
      element.setAttribute('role', 'combobox');
      const child = document.createElement('span');
      element.appendChild(child);
      return child;
    }],
  ])('does not delete selected nodes when Backspace targets an %s editor', (_label, createTarget) => {
    const deleteSelectedNodes = vi.fn();
    const deleteSelectedEdges = vi.fn();
    useFlowCanvasStore.setState({
      deleteSelectedNodes,
      deleteSelectedEdges,
      nodes: [{ id: 'selected', type: 'text', position: { x: 0, y: 0 }, data: {}, selected: true }],
      edges: [],
    });
    render(<FlowCanvasPage />);
    const target = createTarget();
    const mount = target.parentElement ?? target;
    document.body.appendChild(mount);

    fireEvent.keyDown(target, { key: 'Backspace' });

    expect(deleteSelectedNodes).not.toHaveBeenCalled();
    expect(deleteSelectedEdges).not.toHaveBeenCalled();
    mount.remove();
  });

  test('still deletes selected nodes from the unfocused canvas', () => {
    const deleteSelectedNodes = vi.fn();
    const deleteSelectedEdges = vi.fn();
    useFlowCanvasStore.setState({
      deleteSelectedNodes,
      deleteSelectedEdges,
      nodes: [{ id: 'selected', type: 'text', position: { x: 0, y: 0 }, data: {}, selected: true }],
      edges: [],
    });
    render(<FlowCanvasPage />);

    fireEvent.keyDown(window, { key: 'Delete' });

    expect(deleteSelectedNodes).toHaveBeenCalledTimes(1);
    expect(deleteSelectedEdges).toHaveBeenCalledTimes(1);
  });
});
