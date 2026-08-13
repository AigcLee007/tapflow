import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { TemplateAdminListPage } from "./TemplateAdminListPage";

const api = vi.hoisted(() => ({ listAdminFlowTemplates: vi.fn() }));
vi.mock("../../services/v2FlowTemplatesApi", () => api);

beforeEach(() => {
  api.listAdminFlowTemplates.mockReset();
  api.listAdminFlowTemplates.mockResolvedValue([{ id: "template-1", title: "商品视频", description: "", category: "video", nodeCount: 3, status: "draft", graph: { nodes: [], edges: [] } }]);
});

describe("TemplateAdminListPage", () => {
  test("shows template status and opens the draft editor", async () => {
    render(<TemplateAdminListPage />);
    expect(await screen.findByText("商品视频")).toBeTruthy();
    expect(screen.getAllByText("草稿").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "编辑 商品视频" }));
    await waitFor(() => expect(window.location.pathname).toBe("/admin/templates/template-1/editor"));
  });
});
