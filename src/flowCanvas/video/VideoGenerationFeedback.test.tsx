import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { resolveVideoGenerationFeedback, VideoGenerationFeedback } from "./VideoGenerationFeedback";

describe("resolveVideoGenerationFeedback", () => {
  test.each(["pending", "runnable"] as const)("maps %s to submission feedback", (runtimeStatus) => {
    expect(resolveVideoGenerationFeedback(runtimeStatus, "idle", null)).toMatchObject({ kind: "submitting", label: "正在提交任务" });
  });

  test.each(["running", "waiting_provider"] as const)("maps %s to generation feedback", (runtimeStatus) => {
    expect(resolveVideoGenerationFeedback(runtimeStatus, "idle", null)).toMatchObject({ kind: "generating", label: "正在生成视频" });
  });

  test("uses compatibility generating status even at zero progress", () => {
    expect(resolveVideoGenerationFeedback(undefined, "generating", null)).toMatchObject({ kind: "generating" });
  });

  test("maps a safe error message to retryable failure", () => {
    expect(resolveVideoGenerationFeedback("failed", "error", "生成失败")).toEqual({ kind: "error", label: "生成失败" });
  });
});

test("renders an indeterminate reduced-motion-safe status without a percentage", () => {
  render(<VideoGenerationFeedback generationStatus="generating" onRetry={vi.fn()} />);
  expect(screen.getByRole("status").textContent).toContain("正在生成视频");
  expect(screen.queryByText(/0%/)).toBeNull();
  expect(screen.getByTestId("video-generation-indicator").className).toContain("motion-safe:animate-spin");
  expect(screen.getByTestId("node-waiting-video-container")).toBeTruthy();
});

test("renders a retry action for failure", () => {
  const onRetry = vi.fn();
  render(<VideoGenerationFeedback errorMessage="生成失败" generationStatus="error" onRetry={onRetry} />);
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});
