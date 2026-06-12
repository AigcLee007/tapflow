import React from "react";
import { render, screen } from "@testing-library/react";
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
  AiFlowCanvas: () => <div data-testid="canvas-surface" />,
}));

vi.mock("./canvas/FlowTopToolbar", () => ({
  FlowTopToolbar: () => <div data-testid="flow-top-toolbar" />,
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
});
