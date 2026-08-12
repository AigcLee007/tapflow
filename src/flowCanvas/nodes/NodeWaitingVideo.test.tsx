import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NodeWaitingVideo } from "./NodeWaitingVideo";

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      matches: query === "(prefers-reduced-motion: reduce)" && matches,
      removeEventListener: vi.fn(),
    })),
  });
}

afterEach(() => vi.restoreAllMocks());

describe("NodeWaitingVideo", () => {
  it.each(["text", "image", "video"] as const)("uses the %s waiting video after it can play", (kind) => {
    setReducedMotion(false);
    render(<NodeWaitingVideo kind={kind} />);

    const video = screen.getByTestId("node-waiting-video");
    expect(video.getAttribute("src")).toBe(`/node-waiting/${kind}-waiting.mp4`);
    expect((video as HTMLVideoElement).muted).toBe(true);
    expect((video as HTMLVideoElement).loop).toBe(true);
    expect(video.getAttribute("playsinline")).not.toBeNull();
    expect(video.getAttribute("preload")).toBe("metadata");
    expect(video.hasAttribute("controls")).toBe(false);
    expect(screen.getByTestId("node-waiting-fallback")).toBeTruthy();

    fireEvent.canPlay(video);
    expect(screen.queryByTestId("node-waiting-fallback")).toBeNull();
  });

  it("keeps the fallback after the video errors", () => {
    setReducedMotion(false);
    render(<NodeWaitingVideo kind="image" />);

    const video = screen.getByTestId("node-waiting-video");
    fireEvent.error(video);

    expect(screen.getByTestId("node-waiting-fallback")).toBeTruthy();
    expect(screen.queryByTestId("node-waiting-video")).toBeNull();
  });

  it("does not mount video when reduced motion is preferred", () => {
    setReducedMotion(true);
    render(<NodeWaitingVideo kind="video" />);

    expect(screen.getByTestId("node-waiting-fallback")).toBeTruthy();
    expect(screen.queryByTestId("node-waiting-video")).toBeNull();
  });

  it("unmounts video when the reduced motion preference changes", () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        addEventListener: (_type: string, callback: (event: MediaQueryListEvent) => void) => { listener = callback; },
        matches: false,
        removeEventListener: vi.fn(),
      }),
    });
    render(<NodeWaitingVideo kind="text" />);
    expect(screen.getByTestId("node-waiting-video")).toBeTruthy();

    act(() => listener?.({ matches: true } as MediaQueryListEvent));

    expect(screen.getByTestId("node-waiting-fallback")).toBeTruthy();
    expect(screen.queryByTestId("node-waiting-video")).toBeNull();
  });
});
