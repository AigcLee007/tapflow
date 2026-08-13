import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { TemplateAdminEditorPage } from "./TemplateAdminEditorPage";

const api = vi.hoisted(() => ({
  getAdminFlowTemplate: vi.fn(), saveAdminFlowTemplateDraft: vi.fn(), validateAdminFlowTemplate: vi.fn(), publishAdminFlowTemplate: vi.fn(), archiveAdminFlowTemplate: vi.fn(), createAdminFlowTemplateDraft: vi.fn(),
}));
vi.mock("../../services/v2FlowTemplatesApi", () => api);
vi.mock("../../flowCanvas/FlowCanvasPage", () => ({ default: () => <div data-testid="template-canvas" /> }));

beforeEach(() => {
  Object.values(api).forEach((mock) => mock.mockReset());
  api.getAdminFlowTemplate.mockResolvedValue({ id: "template-1", title: "初始模板", description: "", category: "video", status: "draft", version: 0, inputSchema: [], graph: { nodes: [], edges: [] } });
  api.saveAdminFlowTemplateDraft.mockResolvedValue({});
  api.validateAdminFlowTemplate.mockResolvedValue({ id: "template-1", status: "testing", testResult: { graphValid: true, testedAt: "2026-08-13T00:00:00.000Z" } });
  api.publishAdminFlowTemplate.mockResolvedValue({ status: "published", version: 1 });
  api.archiveAdminFlowTemplate.mockResolvedValue({ status: "archived" });
});

describe("TemplateAdminEditorPage", () => {
  test("does not unlock publishing from a local status change and requires server validation", async () => {
    render(<TemplateAdminEditorPage templateId="template-1" />);
    expect(await screen.findByDisplayValue("初始模板")).toBeTruthy();
    expect(screen.getByTestId("template-canvas")).toBeTruthy();
    expect((screen.getByRole("button", { name: "发布模板" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("模板名称"), { target: { value: "商品视频" } });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() => expect(api.saveAdminFlowTemplateDraft).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "验证模板" }));
    await waitFor(() => expect(api.validateAdminFlowTemplate).toHaveBeenCalledWith("template-1"));
    expect((screen.getByRole("button", { name: "发布模板" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
