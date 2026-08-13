import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { TemplateAdminEditorPage } from "./TemplateAdminEditorPage";
import { useFlowCanvasStore } from "../../flowCanvas/store/flowCanvasStore";

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

  test('saves template input markers with the draft graph', async () => {
    api.getAdminFlowTemplate.mockResolvedValue({ id: "template-1", title: "初始模板", description: "", category: "video", status: "draft", version: 0, inputSchema: [], graph: { nodes: [{ id: 'node-1', type: 'image', position: { x: 0, y: 0 }, data: { kind: 'image', generationPrompt: 'old prompt', assetId: 'asset-1' } }], edges: [] } });
    render(<TemplateAdminEditorPage templateId="template-1" />);
    await screen.findByDisplayValue("初始模板");
    fireEvent.change(screen.getByLabelText('模板输入 ID'), { target: { value: 'subject' } });
    fireEvent.change(screen.getByLabelText('模板输入名称'), { target: { value: '商品描述' } });
    expect(screen.queryByLabelText('目标节点 ID')).toBeNull();
    expect(screen.queryByLabelText('字段路径')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /选择节点字段/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /node-1.*generationPrompt/i }));
    fireEvent.click(screen.getByRole('button', { name: '设为模板输入' }));
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() => expect(api.saveAdminFlowTemplateDraft).toHaveBeenCalledWith('template-1', expect.objectContaining({ inputSchema: [expect.objectContaining({ id: 'subject', target: { nodeId: 'node-1', fieldPath: 'data.generationPrompt' } })] })));
  });

  test('only offers existing safe node data fields as template input targets', async () => {
    api.getAdminFlowTemplate.mockResolvedValue({ id: "template-1", title: "初始模板", description: "", category: "video", status: "draft", version: 0, inputSchema: [], graph: { nodes: [{ id: 'node-1', type: 'image', position: { x: 0, y: 0 }, data: { kind: 'image', generationPrompt: 'old prompt', nested: { label: 'safe' }, __proto__: { unsafe: true } } }], edges: [] } });
    render(<TemplateAdminEditorPage templateId="template-1" />);
    await screen.findByDisplayValue("初始模板");
    fireEvent.click(screen.getByRole('button', { name: /选择节点字段/ }));
    expect(screen.getByRole('menuitem', { name: /node-1.*generationPrompt/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /node-1.*nested.label/i })).toBeTruthy();
    expect(screen.queryByText(/__proto__/i)).toBeNull();
  });
});
