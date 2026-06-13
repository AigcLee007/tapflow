import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { FlowTopToolbar } from "./FlowTopToolbar";

vi.mock("../store/flowCanvasStore", () => ({
  useFlowCanvasStore: (selector: (state: { projectTitle: string; setProjectTitle: ReturnType<typeof vi.fn> }) => unknown) =>
    selector({
      projectTitle: "测试项目",
      setProjectTitle: vi.fn(),
    }),
}));

vi.mock("../../services/v2HttpClient", () => ({
  V2_AUTH_CHANGE_EVENT: "v2-auth-change",
  getStoredAccessToken: () => null,
}));

vi.mock("../../billing/billingApi", () => ({
  getBillingSummary: vi.fn(async () => ({
    account: { balanceCents: 0 },
  })),
}));

describe("FlowTopToolbar", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({ items: [] }),
        ok: true,
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("renders a clear shared brand mark in the canvas chrome", async () => {
    render(
      <FlowTopToolbar
        cullingEnabled
        onToggleCulling={vi.fn()}
        saveStatus={{ label: "已保存到云端", status: "saved" }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("brand-mark").getAttribute("data-size")).toBe("canvas");
      expect(screen.getByRole("img", { name: "Aittco" })).toBeTruthy();
      expect(screen.getByDisplayValue("测试项目")).toBeTruthy();
    });
  });
});
