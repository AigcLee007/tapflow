import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { FilmStage } from "./FilmStage";

class IntersectionObserverMock {
  static callback: IntersectionObserverCallback | undefined;
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  constructor(callback: IntersectionObserverCallback) { IntersectionObserverMock.callback = callback; }
}

function mockMotion(reduced: boolean) {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn().mockReturnValue({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
}

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
  });

  test("uses posters only for reduced motion", () => {
    mockMotion(true);
    render(<FilmStage onEnterWorkspace={vi.fn()} onOpenAuth={vi.fn()} />);
    expect(screen.queryAllByTestId("landing-film-video")).toHaveLength(0);
    expect(screen.getAllByTestId("landing-film-poster")).toHaveLength(4);
  });

  test("keeps a poster after video errors and exposes user playback control", () => {
    mockMotion(false);
    render(<FilmStage onEnterWorkspace={vi.fn()} onOpenAuth={vi.fn()} />);
    const video = screen.getAllByTestId("landing-film-video")[0];
    fireEvent.error(video);
    expect(screen.getAllByTestId("landing-film-poster")[0]).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "暂停背景视频" }));
    expect(screen.getByRole("button", { name: "播放背景视频" })).toBeTruthy();
  });

  test("routes nav and CTA actions and marks the current chapter rail item", () => {
    mockMotion(false);
    const onOpenAuth = vi.fn();
    const onEnterWorkspace = vi.fn();
    render(<FilmStage onEnterWorkspace={onEnterWorkspace} onOpenAuth={onOpenAuth} />);
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    fireEvent.click(screen.getByRole("button", { name: "进入工作区" }));
    expect(onOpenAuth).toHaveBeenCalledOnce();
    expect(onEnterWorkspace).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "想象" }).getAttribute("aria-current")).toBe("true");
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
