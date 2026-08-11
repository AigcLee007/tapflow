import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { FilmStage } from "./FilmStage";

class IntersectionObserverMock {
  static callback: IntersectionObserverCallback | undefined;
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  constructor(callback: IntersectionObserverCallback) { IntersectionObserverMock.callback = callback; }
}

function mockMotion(reduced: boolean, mobile = false) {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn((query: string) => ({ matches: query.includes("max-width") ? mobile : reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
}

const mockPlay = vi.fn<() => Promise<void>>();
const mockPause = vi.fn();

beforeEach(() => {
  mockPlay.mockReset().mockResolvedValue(undefined);
  mockPause.mockReset();
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: mockPlay });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: mockPause });
});

afterEach(() => vi.restoreAllMocks());

describe("FilmStage", () => {
  test("switches to the highest-visible chapter and updates preload", () => {
    mockMotion(false);
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
    render(<FilmStage onEnterWorkspace={vi.fn()} onOpenAuth={vi.fn()} />);
    const sections = screen.getAllByRole("region");
    act(() => {
      IntersectionObserverMock.callback?.([{ target: sections[1], intersectionRatio: 0.8, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    expect(sections[1].getAttribute("data-active")).toBe("true");
    expect(screen.getAllByTestId("landing-film-video")[1].getAttribute("preload")).toBe("auto");
    expect(mockPause).toHaveBeenCalled();
    expect(mockPlay).toHaveBeenCalledTimes(2);
  });

  test("uses posters only for reduced motion", () => {
    mockMotion(true);
    render(<FilmStage onEnterWorkspace={vi.fn()} onOpenAuth={vi.fn()} />);
    expect(screen.queryAllByTestId("landing-film-video")).toHaveLength(0);
    expect(screen.getAllByTestId("landing-film-poster")).toHaveLength(4);
  });

  test("keeps a poster after video errors and hides the failed playback control", () => {
    mockMotion(false);
    render(<FilmStage onEnterWorkspace={vi.fn()} onOpenAuth={vi.fn()} />);
    const video = screen.getAllByTestId("landing-film-video")[0];
    fireEvent.error(video);
    expect(screen.getAllByTestId("landing-film-poster")[0]).toBeTruthy();
    expect(screen.queryByRole("button", { name: "暂停背景视频" })).toBeNull();
  });

  test("shows a retryable play action when browser autoplay is rejected", async () => {
    mockMotion(false);
    mockPlay.mockRejectedValueOnce(new Error("autoplay blocked"));
    render(<FilmStage onEnterWorkspace={vi.fn()} onOpenAuth={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "重试播放背景视频" })).toBeTruthy();
    const callsBeforeRetry = mockPlay.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "重试播放背景视频" }));
    await waitFor(() => expect(mockPlay.mock.calls.length).toBeGreaterThan(callsBeforeRetry));
  });

  test("routes nav and CTA actions, scrolls home, and marks the current chapter rail item", () => {
    mockMotion(false);
    const onOpenAuth = vi.fn();
    const onEnterWorkspace = vi.fn();
    render(<FilmStage onEnterWorkspace={onEnterWorkspace} onOpenAuth={onOpenAuth} />);
    const scrollIntoView = vi.fn();
    screen.getAllByRole("region")[0].scrollIntoView = scrollIntoView;
    fireEvent.click(screen.getByRole("button", { name: "返回首页" }));
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    fireEvent.click(screen.getByRole("button", { name: "进入工作区" }));
    expect(onOpenAuth).toHaveBeenCalledOnce();
    expect(onEnterWorkspace).toHaveBeenCalledOnce();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth" });
    expect(screen.getByRole("button", { name: "想象" }).getAttribute("aria-current")).toBe("true");
  });

  test("uses the desktop media paths for a desktop viewport", () => {
    mockMotion(false);
    render(<FilmStage onEnterWorkspace={vi.fn()} onOpenAuth={vi.fn()} />);
    const video = screen.getAllByTestId("landing-film-video")[0];
    expect(video.getAttribute("aria-hidden")).toBe("true");
    expect(video.getAttribute("src")).toContain("/desktop/loop.mp4");
    expect(screen.getAllByTestId("landing-film-poster")[0].getAttribute("src")).toContain("/desktop/poster.webp");
  });

  test("uses mobile media paths for a mobile viewport", () => {
    mockMotion(false, true);
    render(<FilmStage onEnterWorkspace={vi.fn()} onOpenAuth={vi.fn()} />);
    expect(screen.getAllByTestId("landing-film-video")[0].getAttribute("src")).toContain("/mobile/loop.mp4");
    expect(screen.getAllByTestId("landing-film-poster")[0].getAttribute("src")).toContain("/mobile/poster.webp");
  });

  test("ignores an old chapter play rejection after active chapter changes", async () => {
    mockMotion(false);
    let rejectOldPlay: (reason?: unknown) => void = () => undefined;
    mockPlay.mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectOldPlay = reject; }));
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
    render(<FilmStage onEnterWorkspace={vi.fn()} onOpenAuth={vi.fn()} />);
    const sections = screen.getAllByRole("region");
    act(() => {
      IntersectionObserverMock.callback?.([{ target: sections[1], intersectionRatio: 0.8, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    expect(sections[1].getAttribute("data-active")).toBe("true");
    await act(async () => {
      rejectOldPlay(new Error("late rejection"));
      await Promise.resolve();
    });
    expect(screen.queryByRole("button", { name: "重试播放背景视频" })).toBeNull();
    expect(screen.getByRole("button", { name: "暂停背景视频" })).toBeTruthy();
  });

  test("replays the selected source after an orientation change and ignores the old rejection", async () => {
    let mobile = false;
    let mobileListener: (() => void) | undefined;
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn((query: string) => ({
      get matches() { return query.includes("max-width") ? mobile : false; },
      addEventListener: vi.fn((_event: string, listener: () => void) => { if (query.includes("max-width")) mobileListener = listener; }),
      removeEventListener: vi.fn(),
    })) });
    let rejectOldPlay: (reason?: unknown) => void = () => undefined;
    mockPlay.mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectOldPlay = reject; }));
    render(<FilmStage onEnterWorkspace={vi.fn()} onOpenAuth={vi.fn()} />);
    mobile = true;
    act(() => mobileListener?.());
    expect(screen.getAllByTestId("landing-film-video")[0].getAttribute("src")).toContain("/mobile/loop.mp4");
    expect(mockPlay).toHaveBeenCalledTimes(2);
    await act(async () => {
      rejectOldPlay(new Error("old orientation rejected"));
      await Promise.resolve();
    });
    expect(screen.queryByRole("button", { name: "重试播放背景视频" })).toBeNull();
    expect(screen.getByRole("button", { name: "暂停背景视频" })).toBeTruthy();
  });

  test("slows the active film while an auth dialog is open", () => {
    mockMotion(false);
    const { rerender } = render(<FilmStage dialogOpen={false} onEnterWorkspace={vi.fn()} onOpenAuth={vi.fn()} />);
    const video = screen.getAllByTestId("landing-film-video")[0] as HTMLVideoElement;
    expect(video.playbackRate).toBe(1);
    rerender(<FilmStage dialogOpen onEnterWorkspace={vi.fn()} onOpenAuth={vi.fn()} />);
    expect(video.playbackRate).toBe(0.35);
  });
});
