import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { FlowProjectPage } from "./FlowProjectPage";

const useRemoteFlowProjectMock = vi.fn();
const useRemoteFlowAutosaveMock = vi.fn();

vi.mock("./FlowCanvasPage", () => ({
  default: ({ saveStatus }: { saveStatus: { label: string } }) => (
    <div>
      <div data-testid="flow-canvas-page" />
      <div>{saveStatus.label}</div>
    </div>
  ),
}));

vi.mock("./hooks/useRemoteFlowProject", () => ({
  useRemoteFlowProject: () => useRemoteFlowProjectMock(),
}));

vi.mock("./hooks/useRemoteFlowAutosave", () => ({
  useRemoteFlowAutosave: () => useRemoteFlowAutosaveMock(),
}));

vi.mock("./runtime/remoteDraftSaveBarrier", () => ({
  registerRemoteDraftSaveBarrier: vi.fn(() => undefined),
}));

vi.mock("../assets/assetApi", () => ({
  getAsset: vi.fn(),
}));

function setProjectPath(path: string) {
  window.history.replaceState(null, "", path);
}

describe("FlowProjectPage", () => {
  beforeEach(() => {
    setProjectPath("/projects/project-1");
    useRemoteFlowAutosaveMock.mockReturnValue({
      error: null,
      saveNow: vi.fn(async () => undefined),
      status: "saved",
    });
  });

  test("renders clean project loading copy", () => {
    useRemoteFlowProjectMock.mockReturnValue({
      draft: null,
      error: null,
      flow: null,
      loading: true,
      reload: vi.fn(),
    });

    render(<FlowProjectPage />);

    expect(screen.getByText("正在打开项目画布...")).toBeTruthy();
  });

  test("renders clean project error copy", () => {
    useRemoteFlowProjectMock.mockReturnValue({
      draft: null,
      error: "项目不存在",
      flow: null,
      loading: false,
      reload: vi.fn(),
    });

    render(<FlowProjectPage />);

    expect(screen.getByText("项目画布打开失败")).toBeTruthy();
    expect(screen.getByRole("button", { name: "重新加载" })).toBeTruthy();
  });

  test("passes readable save status copy into the canvas page", () => {
    useRemoteFlowProjectMock.mockReturnValue({
      draft: null,
      error: null,
      flow: { id: "flow-1" },
      loading: false,
      reload: vi.fn(),
    });

    render(<FlowProjectPage />);

    expect(screen.getByTestId("flow-canvas-page")).toBeTruthy();
    expect(screen.getByText("已保存到云端")).toBeTruthy();
  });
});
