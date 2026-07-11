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

  test("prompts before closing dirty work and has no native select", () => {
    const onClose = vi.fn(); const view = renderWizard({ onClose });
    fireEvent.click(screen.getByRole("button", { name: /示例生图/ }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByText("放弃未保存的更改？")).toBeTruthy();
    expect(view.container.querySelector("select")).toBeNull();
  });
});
