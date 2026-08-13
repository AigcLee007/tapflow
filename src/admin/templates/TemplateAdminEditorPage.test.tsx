import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { TemplateAdminEditorPage } from "./TemplateAdminEditorPage";

const api = vi.hoisted(() => ({
  getAdminFlowTemplate: vi.fn(), saveAdminFlowTemplateDraft: vi.fn(), markAdminFlowTemplateTesting: vi.fn(), publishAdminFlowTemplate: vi.fn(), archiveAdminFlowTemplate: vi.fn(), createAdminFlowTemplateDraft: vi.fn(),
}));
vi.mock("../../services/v2FlowTemplatesApi", () => api);
vi.mock("../../flowCanvas/FlowCanvasPage", () => ({ default: () => <div data-testid="template-canvas" /> }));

beforeEach(() => {
  Object.values(api).forEach((mock) => mock.mockReset());
  api.getAdminFlowTemplate.mockResolvedValue({ id: "template-1", title: "初始模板", description: "", category: "video", status: "draft", version: 0, inputSchema: [], graph: { nodes: [], edges: [] } });
  api.saveAdminFlowTemplateDraft.mockResolvedValue({});
  api.markAdminFlowTemplateTesting.mockResolvedValue({ status: "testing" });
  api.publishAdminFlowTemplate.mockResolvedValue({ status: "published", version: 1 });
  api.archiveAdminFlowTemplate.mockResolvedValue({ status: "archived" });
});

describe("TemplateAdminEditorPage", () => {
  test("saves draft graph and requires a test before publishing", async () => {
    render(<TemplateAdminEditorPage templateId="template-1" />);
    expect(await screen.findByDisplayValue("初始模板")).toBeTruthy();
    expect(screen.getByTestId("template-canvas")).toBeTruthy();
    expect((screen.getByRole("button", { name: "发布模板" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("模板名称"), { target: { value: "商品视频" } });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() => expect(api.saveAdminFlowTemplateDraft).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "标记已测试" }));
    await waitFor(() => expect(api.markAdminFlowTemplateTesting).toHaveBeenCalledWith("template-1"));
    expect((screen.getByRole("button", { name: "发布模板" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
