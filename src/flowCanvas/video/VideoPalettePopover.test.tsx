import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createDefaultVideoGenerationParams } from "./videoGenerationParams";
import { isSafePreviewUrl, VideoPalettePopover } from "./VideoPalettePopover";

describe("VideoPalettePopover", () => {
  test("uses the shared compact video capsule trigger", () => {
    render(<VideoPalettePopover onChange={vi.fn()} value={createDefaultVideoGenerationParams()} />);
    const trigger = screen.getByRole("button", { name: "调色盘" });
    expect(trigger.className).toContain("bg-white/[0.06]");
    expect(trigger.style.height).toBe("28px");
    expect(trigger.style.borderRadius).toBe("9999px");
  });

  test("closes an open palette and blocks changes when disabled", () => {
    const onChange = vi.fn();
    const value = createDefaultVideoGenerationParams();
    const { rerender } = render(<VideoPalettePopover onChange={onChange} value={value} />);
    fireEvent.click(screen.getByRole("button", { name: "调色盘" }));
    expect(screen.getByRole("dialog", { name: "调色盘" })).toBeTruthy();
    rerender(<VideoPalettePopover disabled onChange={onChange} value={value} />);
    expect(screen.queryByRole("dialog", { name: "调色盘" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "调色盘" }));
    expect(onChange).not.toHaveBeenCalled();
  });
  test("renders only populated semantic Chinese groups without raw source ids", () => {
    const value = {
      ...createDefaultVideoGenerationParams(),
      referenceRolesByKey: {
        portrait: { role: "subject" as const, source: { kind: "asset" as const, id: "asset-subject-123" } },
        hat: { role: "prop" as const, source: { kind: "asset" as const, id: "asset-prop-456" } },
      },
    };
    render(<VideoPalettePopover onChange={vi.fn()} value={value} />);

    fireEvent.click(screen.getByRole("button", { name: "调色盘" }));

    expect(screen.getByText("人物颜色")).toBeTruthy();
    expect(screen.getByText("道具颜色")).toBeTruthy();
    expect(screen.getByRole("group", { name: "人物颜色" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "道具颜色" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "场景颜色" })).toBeNull();
    expect(screen.queryByText("场景颜色")).toBeNull();
    expect(screen.queryByText("风格颜色")).toBeNull();
    expect(screen.queryByText("asset-subject-123")).toBeNull();
    expect(screen.queryByText("asset-prop-456")).toBeNull();
  });

  test("renders a Chinese role fallback source card without exposing a raw asset id", () => {
    const value = {
      ...createDefaultVideoGenerationParams(),
      referenceRolesByKey: {
        portrait: { role: "subject" as const, source: { kind: "asset" as const, id: "asset-subject-123" } },
      },
    };
    render(<VideoPalettePopover onChange={vi.fn()} value={value} />);

    fireEvent.click(screen.getByRole("button", { name: "调色盘" }));

    expect(screen.getByRole("img", { name: "人物参考" })).toBeTruthy();
    expect(screen.queryByText("asset-subject-123")).toBeNull();
  });

  test("renders a provided safe source thumbnail and rejects unsafe URLs", () => {
    const value = {
      ...createDefaultVideoGenerationParams(),
      referenceRolesByKey: {
        portrait: { role: "subject" as const, source: { kind: "asset" as const, id: "asset-subject-123" } },
      },
    };
    const { rerender } = render(
      <VideoPalettePopover
        onChange={vi.fn()}
        sourceDisplayByRole={{ subject: { label: "人物参考", thumbnailUrl: "/api/v2/assets/asset-subject-123/preview" } }}
        value={value}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "调色盘" }));
    expect(screen.getByRole("img", { name: "人物参考" }).getAttribute("src")).toBe("/api/v2/assets/asset-subject-123/preview");

    rerender(<VideoPalettePopover onChange={vi.fn()} sourceDisplayByRole={{ subject: { label: "人物参考", thumbnailUrl: "https://signed.example/secret" } }} value={value} />);
    expect(screen.getByRole("img", { name: "人物参考" }).getAttribute("src")).not.toBe("https://signed.example/secret");
  });

  test("only accepts same-origin query-free asset preview paths", () => {
    const allowed = [
      "/assets/subject.webp",
      "/api/v2/assets/asset-subject-123/preview",
      "/video-camera-library/dolly-in.webp",
    ];
    const rejected = [
      "https://signed.example/subject.webp",
      `${window.location.origin}/assets/subject.webp`,
      "//signed.example/subject.webp",
      "data:image/webp;base64,abc",
      "blob:https://tapflow.test/subject",
      "/assets/subject.webp?X-Amz-Signature=secret",
      "/assets/subject.webp#fragment",
      "/redirect?url=/assets/subject.webp",
      "/unapproved/subject.webp",
      "/api/v2/assets/asset-subject-123/preview?token=secret",
    ];

    for (const url of allowed) expect(isSafePreviewUrl(url)).toBe(true);
    for (const url of rejected) expect(isSafePreviewUrl(url)).toBe(false);
  });

  test("context color updates only context palette refs and exposes a non-color selected marker", () => {
    const onChange = vi.fn();
    const value = {
      ...createDefaultVideoGenerationParams(),
      visualTone: "cool_moonlight",
      referenceRolesByKey: {
        portrait: { role: "subject" as const, source: { kind: "asset" as const, id: "asset-subject" } },
      },
    };
    const { rerender } = render(<VideoPalettePopover onChange={onChange} value={value} />);

    fireEvent.click(screen.getByRole("button", { name: "调色盘" }));
    fireEvent.click(screen.getByRole("button", { name: "人物颜色：洋红" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      visualTone: "cool_moonlight",
      contextPaletteRefs: [{
        role: "subject",
        source: { kind: "asset", id: "asset-subject" },
        colorToken: "洋红",
      }],
    }));

    rerender(<VideoPalettePopover onChange={vi.fn()} value={{
      ...value,
      contextPaletteRefs: [{
        role: "subject",
        source: { kind: "asset", id: "asset-subject" },
        colorToken: "洋红",
      }],
    }} />);
    expect(screen.getByRole("button", { name: "人物颜色：洋红" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByLabelText("已选中").length).toBeGreaterThan(0);
  });

  test("visual tone renders five compact three-strip Chinese cards and changes only visualTone", () => {
    const onChange = vi.fn();
    const value = {
      ...createDefaultVideoGenerationParams(),
      contextPaletteRefs: [{
        role: "subject",
        source: { kind: "asset" as const, id: "asset-subject" },
        colorToken: "湖蓝",
      }],
    };
    render(<VideoPalettePopover onChange={onChange} value={value} />);

    fireEvent.click(screen.getByRole("button", { name: "调色盘" }));
    const tones = ["自然", "青橙电影", "暖色夕阳", "冷调月光", "黑白"];
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    for (const tone of tones) {
      expect(screen.getByRole("radio", { name: tone })).toBeTruthy();
    }
    expect(screen.getAllByTestId("色调色带")).toHaveLength(15);
    fireEvent.click(screen.getByRole("radio", { name: "青橙电影" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      visualTone: "cinematic_teal",
      contextPaletteRefs: value.contextPaletteRefs,
    }));
  });

  test("shows Chinese empty state and closes with outside click or Escape", () => {
    render(<VideoPalettePopover onChange={vi.fn()} value={createDefaultVideoGenerationParams()} />);

    const trigger = screen.getByRole("button", { name: "调色盘" });
    fireEvent.click(trigger);
    expect(screen.getByText("当前没有可用的参考角色")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "调色盘" })).toBeNull();

    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog", { name: "调色盘" })).toBeNull();
  });
});
