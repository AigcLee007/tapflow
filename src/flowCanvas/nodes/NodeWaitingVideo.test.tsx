import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NodeWaitingVideo } from "./NodeWaitingVideo";

const originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");

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

afterEach(() => {
  vi.restoreAllMocks();
  if (originalMatchMedia) Object.defineProperty(window, "matchMedia", originalMatchMedia);
  else delete (window as Partial<Window>).matchMedia;
});

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("probably");
});

describe("NodeWaitingVideo", () => {
  it.each(["text", "image", "video"] as const)("uses the %s waiting video after it can play", async (kind) => {
    setReducedMotion(false);
    render(<NodeWaitingVideo kind={kind} />);

    const video = screen.getByTestId("node-waiting-video");
    expect(video.getAttribute("src")).toBe(`/node-waiting/${kind}-waiting.mp4`);
    expect((video as HTMLVideoElement).muted).toBe(true);
    expect((video as HTMLVideoElement).loop).toBe(true);
    expect(video.getAttribute("playsinline")).not.toBeNull();
    expect(video.getAttribute("preload")).toBe("metadata");
    expect(video.hasAttribute("controls")).toBe(false);
    expect((video as HTMLVideoElement).hidden).toBe(true);
    expect(screen.getByTestId("node-waiting-fallback")).toBeTruthy();

    await act(async () => { fireEvent.canPlay(video); });
    expect((video as HTMLVideoElement).hidden).toBe(false);
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

  it("falls back when matchMedia is unavailable", () => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: undefined });
    render(<NodeWaitingVideo kind="text" />);
    expect(screen.getByTestId("node-waiting-fallback")).toBeTruthy();
    expect(screen.queryByTestId("node-waiting-video")).toBeNull();
  });

  it("falls back when autoplay is rejected and marks video decorative", async () => {
    setReducedMotion(false);
    render(<NodeWaitingVideo kind="video" />);
    const video = screen.getByTestId("node-waiting-video") as HTMLVideoElement;
    expect(video.getAttribute("aria-hidden")).toBe("true");
    vi.spyOn(video, "play").mockRejectedValue(new Error("blocked"));
    await act(async () => { fireEvent.canPlay(video); await Promise.resolve(); });
    expect(screen.getByTestId("node-waiting-fallback")).toBeTruthy();
    expect(screen.queryByTestId("node-waiting-video")).toBeNull();
  });

  it("falls back when MP4 playback is unsupported", () => {
    setReducedMotion(false);
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("");
    render(<NodeWaitingVideo kind="video" />);
    fireEvent.canPlay(screen.getByTestId("node-waiting-video"));
    expect(screen.getByTestId("node-waiting-fallback")).toBeTruthy();
    expect(screen.queryByTestId("node-waiting-video")).toBeNull();
  });

  it("resets failure state when kind changes", () => {
    setReducedMotion(false);
    const { rerender } = render(<NodeWaitingVideo kind="text" />);
    fireEvent.error(screen.getByTestId("node-waiting-video"));
    rerender(<NodeWaitingVideo kind="image" />);
    const video = screen.getByTestId("node-waiting-video");
    expect(video.getAttribute("src")).toBe("/node-waiting/image-waiting.mp4");
    expect((video as HTMLVideoElement).hidden).toBe(true);
  });

  it("does not mount video when reduced motion is preferred", () => {
    setReducedMotion(true);
    render(<NodeWaitingVideo kind="video" />);

    expect(screen.getByTestId("node-waiting-fallback")).toBeTruthy();
    expect(screen.queryByTestId("node-waiting-video")).toBeNull();
  });

  it("pauses and unmounts video when the reduced motion preference changes", () => {
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
    const video = screen.getByTestId("node-waiting-video") as HTMLVideoElement;
    const pause = vi.spyOn(video, "pause").mockImplementation(() => undefined);

    act(() => listener?.({ matches: true } as MediaQueryListEvent));

    expect(screen.getByTestId("node-waiting-fallback")).toBeTruthy();
    expect(screen.queryByTestId("node-waiting-video")).toBeNull();
    expect(pause).toHaveBeenCalled();
  });

  it("ignores a pending play completion after reduced motion becomes preferred", async () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn().mockReturnValue({
      addEventListener: (_type: string, callback: (event: MediaQueryListEvent) => void) => { listener = callback; },
      matches: false,
      removeEventListener: vi.fn(),
    }) });
    let resolvePlay: (() => void) | undefined;
    vi.spyOn(HTMLMediaElement.prototype, "play").mockReturnValue(new Promise<void>((resolve) => { resolvePlay = resolve; }));
    render(<NodeWaitingVideo kind="text" />);
    const video = screen.getByTestId("node-waiting-video");
    fireEvent.canPlay(video);
    act(() => listener?.({ matches: true } as MediaQueryListEvent));
    await act(async () => resolvePlay?.());
    expect(screen.getByTestId("node-waiting-fallback")).toBeTruthy();
    expect(screen.queryByTestId("node-waiting-video")).toBeNull();
  });
});
