import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { getNodeEditorSurfaceStyle, NodeEditorSurface } from "./NodeEditorSurface";

const viewport = vi.hoisted(() => ({ zoom: 1 }));

vi.mock("@xyflow/react", () => ({
  useViewport: () => ({ zoom: viewport.zoom }),
}));

describe("NodeEditorSurface", () => {
  beforeEach(() => {
    viewport.zoom = 1;
    vi.unstubAllGlobals();
  });

  test.each([
    [0.25, "translateX(-50%) scale(4)"],
    [0.5, "translateX(-50%) scale(2)"],
    [1, "translateX(-50%) scale(1)"],
    [2, "translateX(-50%) scale(0.5)"],
  ])("uses the inverse scale for viewport zoom %s", (zoom, transform) => {
    expect(getNodeEditorSurfaceStyle("video", zoom).transform).toBe(transform);
  });

  test("preserves the tuned text and image surface values", () => {
    expect(getNodeEditorSurfaceStyle("text", 1)).toMatchObject({
      borderRadius: 18,
      gap: 10,
      minHeight: 120,
      padding: "12px 16px 12px",
      top: "calc(100% + 14px)",
      transform: "translateX(-50%) scale(1)",
      transformOrigin: "top center",
      width: "clamp(520px, 42vw, 760px)",
      zIndex: 30,
    });
    expect(getNodeEditorSurfaceStyle("image", 1)).toMatchObject({
      borderRadius: 18,
      gap: 10,
      minHeight: 128,
      padding: "12px 16px 12px",
      top: "calc(100% + 14px)",
      transform: "translateX(-50%) scale(1)",
      transformOrigin: "top center",
      width: "clamp(560px, 44vw, 820px)",
      zIndex: 30,
    });
  });

  test("keeps video sizing independent from text and image", () => {
    expect(getNodeEditorSurfaceStyle("video", 1)).toMatchObject({
      background: "#17171b",
      minHeight: 120,
      width: "clamp(640px, 52vw, 980px)",
      zIndex: 40,
    });
    expect(getNodeEditorSurfaceStyle("text", 1).width).toBe("clamp(520px, 42vw, 760px)");
    expect(getNodeEditorSurfaceStyle("image", 1).width).toBe("clamp(560px, 44vw, 820px)");
  });

  test("keeps the video editor in the narrow viewport without changing text or image anchoring", () => {
    expect(getNodeEditorSurfaceStyle("video", 0.5, true)).toMatchObject({
      left: 0,
      transform: "scale(2)",
      transformOrigin: "top left",
      width: "calc(100vw - 32px)",
    });
    expect(getNodeEditorSurfaceStyle("text", 0.5)).toMatchObject({
      left: "50%",
      transform: "translateX(-50%) scale(2)",
      transformOrigin: "top center",
    });
  });

  test("does not animate the video editor inverse transform", () => {
    expect(getNodeEditorSurfaceStyle("video", 1).transition).toBe("none");
    expect(getNodeEditorSurfaceStyle("text", 1).transition).toBe("transform 0.1s ease-out");
    expect(getNodeEditorSurfaceStyle("image", 1).transition).toBe("transform 0.1s ease-out");
  });

  test("syncs narrow-video anchoring with a legacy media-query listener", () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    const addListener = vi.fn((nextListener: (event: MediaQueryListEvent) => void) => {
      listener = nextListener;
    });
    const removeListener = vi.fn();
    const query = {
      addListener,
      matches: true,
      removeListener,
    };
    vi.stubGlobal("matchMedia", vi.fn(() => query));

    render(
      <NodeEditorSurface ariaLabel="Video editor" variant="video">
        <span>content</span>
      </NodeEditorSurface>,
    );

    expect(screen.getByLabelText("Video editor").style.left).toBe("0px");
    query.matches = false;
    act(() => listener?.({ matches: false } as MediaQueryListEvent));
    expect(screen.getByLabelText("Video editor").style.left).toBe("50%");
  });

  test("isolates editor interactions from the canvas", () => {
    render(
      <NodeEditorSurface ariaLabel="Video editor" variant="video">
        <span>content</span>
      </NodeEditorSurface>,
    );

    const surface = screen.getByLabelText("Video editor");
    expect(surface.className).toContain("nodrag");
    expect(surface.className).toContain("nopan");
    expect(surface.className).toContain("nowheel");
    expect(surface.dataset.nodeEditorVariant).toBe("video");
  });
});
