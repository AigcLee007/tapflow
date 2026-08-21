import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasAgentSkillAuthoring } from "./CanvasAgentSkillAuthoring";

const authorSkillTurn = vi.fn();
const createSkillDraft = vi.fn();
vi.mock("./skillApi", () => ({ authorSkillTurn: (...args: unknown[]) => authorSkillTurn(...args), createSkillDraft: (...args: unknown[]) => createSkillDraft(...args) }));

describe("CanvasAgentSkillAuthoring", () => {
  beforeEach(() => { authorSkillTurn.mockReset(); createSkillDraft.mockReset(); });

  it("turns a description into an editable draft and saves it", async () => {
    authorSkillTurn.mockResolvedValue({ assistantReply: "草稿已整理", missingQuestions: [], readyToPreview: true, sourcePatch: { modality: "text", name: "脚本 Skill", outputs: "脚本", summary: "写脚本" }, validationNotes: [] });
    createSkillDraft.mockResolvedValue({ id: "skill-1", revision: 0, source: { name: "脚本 Skill" } });
    const onCreated = vi.fn();
    render(<CanvasAgentSkillAuthoring onBack={vi.fn()} onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText("描述 Skill"), { target: { value: "把产品卖点写成短视频脚本" } });
    fireEvent.click(screen.getByRole("button", { name: "整理草稿" }));
    await waitFor(() => expect(screen.getByDisplayValue("脚本 Skill")).toBeTruthy());
    expect(authorSkillTurn).toHaveBeenCalledWith(expect.objectContaining({ userMessage: "把产品卖点写成短视频脚本" }));
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: "skill-1" })));
  });
});
