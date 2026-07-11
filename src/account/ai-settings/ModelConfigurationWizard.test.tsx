import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ModelConfigurationWizard } from "./ModelConfigurationWizard";

const saveDraft = vi.fn();
const publish = vi.fn();
const testRoute = vi.fn();

vi.mock("../../services/v2AiModelConfigurationsApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/v2AiModelConfigurationsApi")>()),
  publishModelConfiguration: (...args: unknown[]) => publish(...args),
  saveModelConfigurationDraft: (...args: unknown[]) => saveDraft(...args),
}));
vi.mock("../../services/v2AiModelCatalogApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/v2AiModelCatalogApi")>()),
  testAiRoute: (...args: unknown[]) => testRoute(...args),
}));

const id = "11111111-1111-4111-8111-111111111111";
const saved = {
  catalog: { id, status: "draft" }, connection: { baseUrl: "https://api.example.com", environment: "production", id, name: "示例连接", status: "active" },
  credential: { id, name: "示例密钥", providerId: "provider-1", secretFingerprint: "abcd", status: "active" },
  model: { displayName: "示例生图", id, modality: "image", modelFamily: "example", modelKey: "example-image" },
  pricing: { active: true, minChargeCredits: 1, unit: "image_generation" as const, unitCredits: 2 },
  route: { configurationRevision: 2, id, key: "example-image-line-1", status: "draft", testedRevision: null },
};

function renderWizard(props: Partial<React.ComponentProps<typeof ModelConfigurationWizard>> = {}) {
  return render(<ModelConfigurationWizard open onClose={vi.fn()} onPublished={vi.fn()} {...props} />);
}

async function fillToFinalStep() {
  fireEvent.click(screen.getByRole("button", { name: /示例生图/ }));
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  fireEvent.change(screen.getByLabelText("连接名称"), { target: { value: "示例连接" } });
  fireEvent.change(screen.getByLabelText("基础 URL"), { target: { value: "https://api.example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  fireEvent.change(screen.getByLabelText("线路名称"), { target: { value: "线路一" } });
  fireEvent.click(screen.getByRole("button", { name: "新建密钥" }));
  fireEvent.change(screen.getByLabelText("密钥名称"), { target: { value: "示例密钥" } });
  fireEvent.change(screen.getByLabelText("API 密钥"), { target: { value: "secret-value" } });
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  fireEvent.change(screen.getByLabelText("单价积分"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("最低积分"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
}

describe("ModelConfigurationWizard", () => {
  beforeEach(() => { saveDraft.mockReset(); publish.mockReset(); testRoute.mockReset(); });

  test("shows builtin templates and applies their model defaults", async () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: /示例生图/ }));
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.change(screen.getByLabelText("连接名称"), { target: { value: "示例连接" } });
    fireEvent.change(screen.getByLabelText("基础 URL"), { target: { value: "https://api.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect((screen.getByLabelText("上游模型") as HTMLInputElement).value).toBe("example-image");
    expect(screen.getByText("步骤 3 / 5")).toBeTruthy();
  });

  test("supports custom OpenAI compatible model fields", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "自定义 OpenAI 兼容模型" }));
    expect(screen.getByLabelText("提供商标识")).toBeTruthy();
    expect(screen.getByLabelText("模型标识")).toBeTruthy();
  });

  test("uses segmented credential choice and only exposes safe matching credentials", async () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: /示例生图/ }));
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.change(screen.getByLabelText("连接名称"), { target: { value: "示例连接" } });
    fireEvent.change(screen.getByLabelText("基础 URL"), { target: { value: "https://api.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.click(screen.getByRole("button", { name: "使用已有密钥" }));
    expect(screen.getByText("现有密钥")).toBeTruthy();
    expect(screen.queryByText("secret-value")).toBeNull();
  });

  test("filters existing credentials by the live selected provider and refreshes when it changes", () => {
    const providers = [
      { id: "provider-example", key: "example", kind: "openai-compatible", name: "示例", status: "active", defaultBaseUrl: null, capabilities: {} },
      { id: "provider-other", key: "other", kind: "openai-compatible", name: "其他", status: "active", defaultBaseUrl: null, capabilities: {} },
    ];
    const credentials = [
      { id: "credential-example", providerId: "provider-example", name: "示例密钥", status: "active", maskedSecret: "****", secretFingerprint: "aaaa", lastUsedAt: null, rotatedAt: null },
      { id: "credential-other", providerId: "provider-other", name: "其他密钥", status: "active", maskedSecret: "****", secretFingerprint: "bbbb", lastUsedAt: null, rotatedAt: null },
    ];
    renderWizard({ providers, credentials });
    fireEvent.click(screen.getByRole("button", { name: /示例生图/ }));
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.change(screen.getByLabelText("连接名称"), { target: { value: "连接" } });
    fireEvent.change(screen.getByLabelText("基础 URL"), { target: { value: "https://api.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.click(screen.getByRole("button", { name: "使用已有密钥" }));
    fireEvent.click(screen.getByRole("button", { name: /现有密钥/ }));
    expect(screen.getAllByText(/示例密钥/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/其他密钥/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "上一步" }));
    fireEvent.click(screen.getByRole("button", { name: "上一步" }));
    fireEvent.click(screen.getByRole("button", { name: "自定义 OpenAI 兼容模型" }));
    fireEvent.change(screen.getByLabelText("提供商标识"), { target: { value: "other" } });
    fireEvent.change(screen.getByLabelText("提供商名称"), { target: { value: "其他" } });
    fireEvent.change(screen.getByLabelText("模型名称"), { target: { value: "其他模型" } });
    fireEvent.change(screen.getByLabelText("模型标识"), { target: { value: "other-model" } });
    fireEvent.change(screen.getByLabelText("模型系列"), { target: { value: "other" } });
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.change(screen.getByLabelText("连接名称"), { target: { value: "其他连接" } });
    fireEvent.change(screen.getByLabelText("基础 URL"), { target: { value: "https://other.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.click(screen.getByRole("button", { name: "使用已有密钥" }));
    fireEvent.click(screen.getByRole("button", { name: /现有密钥/ }));
    expect(screen.getAllByText(/其他密钥/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/示例密钥/)).toBeNull();
  });

  test("keeps the existing credential picker disabled when the selected provider is unresolved", () => {
    renderWizard({ credentials: [{ id: "credential-example", providerId: "provider-example", name: "示例密钥", status: "active", maskedSecret: "****", secretFingerprint: "aaaa", lastUsedAt: null, rotatedAt: null }] });
    fireEvent.click(screen.getByRole("button", { name: "自定义 OpenAI 兼容模型" }));
    fireEvent.change(screen.getByLabelText("提供商标识"), { target: { value: "unknown" } });
    fireEvent.change(screen.getByLabelText("提供商名称"), { target: { value: "未知" } });
    fireEvent.change(screen.getByLabelText("模型名称"), { target: { value: "未知模型" } });
    fireEvent.change(screen.getByLabelText("模型标识"), { target: { value: "unknown-model" } });
    fireEvent.change(screen.getByLabelText("模型系列"), { target: { value: "unknown" } });
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.change(screen.getByLabelText("连接名称"), { target: { value: "连接" } });
    fireEvent.change(screen.getByLabelText("基础 URL"), { target: { value: "https://unknown.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.click(screen.getByRole("button", { name: "使用已有密钥" }));
    expect((screen.getByRole("button", { name: /现有密钥/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/示例密钥/)).toBeNull();
  });

  test("clears new secret after saving a draft", async () => {
    saveDraft.mockResolvedValue(saved);
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: /示例生图/ }));
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.change(screen.getByLabelText("连接名称"), { target: { value: "示例连接" } });
    fireEvent.change(screen.getByLabelText("基础 URL"), { target: { value: "https://api.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.change(screen.getByLabelText("线路名称"), { target: { value: "线路一" } });
    fireEvent.click(screen.getByRole("button", { name: "新建密钥" }));
    fireEvent.change(screen.getByLabelText("密钥名称"), { target: { value: "示例密钥" } });
    fireEvent.change(screen.getByLabelText("API 密钥"), { target: { value: "secret-value" } });
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.change(screen.getByLabelText("单价积分"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("最低积分"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() => expect(saveDraft).toHaveBeenCalled());
    expect(screen.queryByDisplayValue("secret-value")).toBeNull();
  });

  test("does not offer publishing before a saved current test", () => {
    renderWizard();
    expect(screen.queryByRole("button", { name: "发布" })).toBeNull();
  });

  test("keeps the saved draft editable after a failed test without exposing a secret", async () => {
    saveDraft.mockResolvedValue(saved);
    testRoute.mockResolvedValue({ status: "failed", error: { message: "secret-value" } });
    renderWizard();
    await fillToFinalStep();
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() => expect(saveDraft).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "测试线路" }));
    await waitFor(() => expect(screen.getByText("测试失败")).toBeTruthy());
    expect(screen.getByRole("button", { name: "测试线路" })).toBeTruthy();
    expect(screen.queryByText("secret-value")).toBeNull();
  });

  test("only enables publish after the current saved revision tests successfully", async () => {
    saveDraft.mockResolvedValue(saved);
    testRoute.mockResolvedValue({ status: "ok", error: null });
    renderWizard();
    await fillToFinalStep();
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() => expect(saveDraft).toHaveBeenCalled());
    expect((screen.getByRole("button", { name: "发布" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "测试线路" }));
    await waitFor(() => expect(screen.getByText("测试通过")).toBeTruthy());
    expect((screen.getByRole("button", { name: "发布" }) as HTMLButtonElement).disabled).toBe(false);
  });

  test("publishes a saved and tested configuration then closes", async () => {
    const onClose = vi.fn(); const onPublished = vi.fn();
    saveDraft.mockResolvedValue(saved); testRoute.mockResolvedValue({ status: "ok", error: null }); publish.mockResolvedValue(saved);
    renderWizard({ onClose, onPublished });
    await fillToFinalStep();
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() => expect(saveDraft).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "测试线路" }));
    await waitFor(() => expect(screen.getByText("测试通过")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "发布" }));
    await waitFor(() => expect(onPublished).toHaveBeenCalledWith(saved));
    expect(onClose).toHaveBeenCalled();
  });

  test("requires an explicit credential choice for a backup route", () => {
    renderWizard({ backupFromRoute: { connection: { id, name: "连接", baseUrl: "https://api.example.com", environment: "production" }, model: { displayName: "示例", modality: "image", modelFamily: "example", modelKey: "example-image" }, provider: { key: "example", kind: "openai-compatible", name: "示例" }, pricing: { minChargeCredits: 1, unit: "image_generation", unitCredits: 2 }, route: { id, key: "source-key", configurationRevision: 1 } } });
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect((screen.getByRole("button", { name: "保存草稿" }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("prompts before closing dirty work and has no native select", () => {
    const onClose = vi.fn(); const view = renderWizard({ onClose });
    fireEvent.click(screen.getByRole("button", { name: /示例生图/ }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByText("放弃未保存的更改？")).toBeTruthy();
    expect(view.container.querySelector("select")).toBeNull();
  });

  test("dismisses dirty close confirmation on escape and backdrop click", () => {
    const view = renderWizard();
    fireEvent.click(screen.getByRole("button", { name: /示例生图/ }));
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("放弃未保存的更改？")).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    const prompt = screen.getByText("放弃未保存的更改？");
    fireEvent.pointerDown(prompt.parentElement!.parentElement!);
    expect(view.container.querySelector("[role=dialog]")).toBeTruthy();
    expect(screen.queryByText("放弃未保存的更改？")).toBeNull();
  });

  test("moves focus into the dialog, traps Tab, and restores focus on close", () => {
    const trigger = document.createElement("button"); trigger.textContent = "打开配置"; document.body.appendChild(trigger); trigger.focus();
    const { rerender } = render(<ModelConfigurationWizard open onClose={vi.fn()} onPublished={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    rerender(<ModelConfigurationWizard open={false} onClose={vi.fn()} onPublished={vi.fn()} />);
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
