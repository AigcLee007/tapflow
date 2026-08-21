import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CanvasAgentSkillPicker } from "./CanvasAgentSkillPicker";

const skill = { id: "skill-1", modality: "text" as const, name: "广告文案", ownerUserId: null, status: "published", summary: "生成广告文案", version: 1, visibility: "official" as const };

describe("CanvasAgentSkillPicker", () => {
  it("selects a skill and opens details", () => {
    const onSelect = vi.fn();
    const onOpenDetail = vi.fn();
    render(<CanvasAgentSkillPicker canCreate onCreate={vi.fn()} onOpenDetail={onOpenDetail} onSelect={onSelect} skills={[skill]} />);
    fireEvent.click(screen.getByRole("button", { name: "选择 广告文案" }));
    fireEvent.click(screen.getByRole("button", { name: "查看 广告文案" }));
    expect(onSelect).toHaveBeenCalledWith(skill);
    expect(onOpenDetail).toHaveBeenCalledWith(skill);
  });

  it("hides creation when authoring is disabled", () => {
    render(<CanvasAgentSkillPicker onCreate={vi.fn()} onOpenDetail={vi.fn()} onSelect={vi.fn()} skills={[]} />);
    expect(screen.queryByRole("button", { name: "创建 Skill" })).toBeNull();
    expect(screen.getByText("没有匹配的 Skill")).toBeTruthy();
  });

  it("groups safe Skills by modality and supports retry states", () => {
    render(
      <CanvasAgentSkillPicker
        onCreate={vi.fn()}
        onOpenDetail={vi.fn()}
        onSelect={vi.fn()}
        skills={[
          skill,
          { ...skill, id: "skill-image", modality: "image", name: "封面图" },
          { ...skill, id: "skill-video", modality: "video", name: "短视频" },
        ]}
      />,
    );
    expect(screen.getByRole("region", { name: "文本" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "图片" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "视频" })).toBeTruthy();
  });

  it("shows unavailable state with retry", () => {
    const onRetry = vi.fn();
    render(<CanvasAgentSkillPicker onCreate={vi.fn()} onOpenDetail={vi.fn()} onRetry={onRetry} onSelect={vi.fn()} skills={[]} unavailableReason="Skill 暂不可用" />);
    expect(screen.getByRole("alert").textContent).toContain("Skill 暂不可用");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
