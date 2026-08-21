import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasAgentSkillDetail } from "./CanvasAgentSkillDetail";

const getSkillDraft = vi.fn();
const updateSkillDraft = vi.fn();
const createSkillDraft = vi.fn();
const publishSkill = vi.fn();
vi.mock("./skillApi", () => ({ createSkillDraft: (...args: unknown[]) => createSkillDraft(...args), getSkillDraft: (...args: unknown[]) => getSkillDraft(...args), publishSkill: (...args: unknown[]) => publishSkill(...args), updateSkillDraft: (...args: unknown[]) => updateSkillDraft(...args) }));

const skill = { id: "skill-1", modality: "text" as const, name: "广告文案", ownerUserId: "user-1", status: "published", summary: "生成广告文案", version: 2, visibility: "private" as const };

describe("CanvasAgentSkillDetail", () => {
  beforeEach(() => { getSkillDraft.mockReset(); updateSkillDraft.mockReset(); createSkillDraft.mockReset(); publishSkill.mockReset(); getSkillDraft.mockResolvedValue({ id: "skill-1", ownerUserId: "user-1", revision: 3, source: { askWhen: "缺少输入时追问", inputs: "卖点", method: "分析\n写作", modality: "text", name: "广告文案", outputs: "标题", summary: "新版简介", usageScenarios: "广告" } }); updateSkillDraft.mockResolvedValue({ id: "skill-1", ownerUserId: "user-1", revision: 4, source: {} }); publishSkill.mockResolvedValue(skill); });

  it("loads, saves, and publishes a private draft", async () => {
    const onSaved = vi.fn();
    render(<CanvasAgentSkillDetail onBack={vi.fn()} onSaved={onSaved} skill={skill} />);
    expect(await screen.findByDisplayValue("新版简介")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Skill 简介"), { target: { value: "更新简介" } });
    fireEvent.click(screen.getByRole("button", { name: "发布" }));
    await waitFor(() => expect(publishSkill).toHaveBeenCalledWith("skill-1", expect.objectContaining({ summary: "更新简介" })));
    expect(onSaved).toHaveBeenCalled();
  });
});
