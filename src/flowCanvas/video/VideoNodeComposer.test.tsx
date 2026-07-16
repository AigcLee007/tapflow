import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createDefaultVideoGenerationParams } from "./videoGenerationParams";
import { VideoNodeComposer } from "./VideoNodeComposer";
import { VideoNodeLegacyComposer } from "./VideoNodeLegacyComposer";

vi.mock("./useVideoGenerationCatalog", () => ({
  useVideoGenerationCatalog: () => ({ error: null, loading: true, models: [], retry: vi.fn() }),
}));

describe("VideoNodeComposer", () => {
  test("only renders controls while the node is selected", () => {
    const data = { generationPrompt: "", params: { videoGeneration: createDefaultVideoGenerationParams() } } as any;
    const { rerender } = render(<VideoNodeComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} selected={false} />);
    expect(screen.queryByLabelText("Video prompt")).toBeNull();

    rerender(<VideoNodeComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} selected />);
    expect(screen.getByLabelText("Video prompt")).toBeTruthy();
  });

  test("writes the prompt and keeps model and parameters layers mutually exclusive", () => {
    const onUpdate = vi.fn();
    const data = { generationPrompt: "", params: { videoGeneration: createDefaultVideoGenerationParams() } } as any;
    render(<VideoNodeComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={onUpdate} selected />);

    fireEvent.change(screen.getByLabelText("Video prompt"), { target: { value: "A quiet city" } });
    expect(onUpdate).toHaveBeenCalledWith({ generationPrompt: "A quiet city" });

    fireEvent.click(screen.getByRole("button", { name: "Choose video model" }));
    expect(screen.getByRole("status", { name: "Loading video models" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Video parameters" }));
    expect(screen.queryByRole("status", { name: "Loading video models" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Video parameters" })).toBeTruthy();
  });

  test("dismisses compact layers with Escape and restores focus to their trigger", () => {
    const data = { generationPrompt: "", params: { videoGeneration: createDefaultVideoGenerationParams() } } as any;
    render(<VideoNodeComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} selected />);

    const modelButton = screen.getByRole("button", { name: "Choose video model" });
    fireEvent.click(modelButton);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("status", { name: "Loading video models" })).toBeNull();
    expect(document.activeElement).toBe(modelButton);

    const parameterButton = screen.getByRole("button", { name: "Video parameters" });
    fireEvent.click(parameterButton);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Video parameters" })).toBeNull();
    expect(document.activeElement).toBe(parameterButton);
  });

  test("stacks the V2 composer controls at narrow layouts without changing the node itself", () => {
    const data = { generationPrompt: "", params: { videoGeneration: createDefaultVideoGenerationParams() } } as any;
    render(<VideoNodeComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} selected />);

    expect(screen.getByLabelText("Video composer").className).toContain("max-md:w-full");
    expect(screen.getByLabelText("Video composer").className).toContain("max-md:flex-col");
    expect(screen.getByLabelText("Choose video model").parentElement?.parentElement?.className).toContain("max-md:flex-col");
  });

  test("retains the rollback composer model, aspect, duration, HD, count, and generation controls", () => {
    const data = { generationPrompt: "", modelId: "veo3.1-fast", params: { aspect_ratio: "16:9", duration: "4" } } as any;
    render(<VideoNodeLegacyComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} />);

    expect(screen.getByRole("button", { name: /video model video-1/i })).toBeTruthy();
    expect(screen.getByText("1080p")).toBeTruthy();
    expect(screen.getByText("高清")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate video video-1" })).toBeTruthy();
  });
});
