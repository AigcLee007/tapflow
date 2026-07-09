import React from "react";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PanoramaViewer } from "./PanoramaViewer";

type MockViewerInstance = {
  addEventListener: (event: string, handler: (payload?: any) => void) => void;
  destroy: ReturnType<typeof vi.fn>;
  getPosition: ReturnType<typeof vi.fn>;
  rotate: ReturnType<typeof vi.fn>;
  setOption: ReturnType<typeof vi.fn>;
  state: { ready: boolean };
  toggleFullscreen: ReturnType<typeof vi.fn>;
  zoom: ReturnType<typeof vi.fn>;
};

const photoSphereViewerMocks = vi.hoisted(() => {
  const instances: MockViewerInstance[] = [];

  const Viewer = vi.fn(function Viewer() {
    const listeners = new Map<string, (payload?: any) => void>();
    const instance: MockViewerInstance = {
      addEventListener: (event: string, handler: (payload?: any) => void) => {
        listeners.set(event, handler);
      },
      destroy: vi.fn(),
      getPosition: vi.fn(() => ({ pitch: 0, yaw: 0 })),
      rotate: vi.fn(),
      setOption: vi.fn(),
      state: { ready: false },
      toggleFullscreen: vi.fn(),
      zoom: vi.fn(),
    };
    instances.push(instance);
    setTimeout(() => {
      instance.state.ready = true;
      listeners.get("ready")?.({});
    }, 0);
    return instance;
  });

  return { Viewer, instances };
});

vi.mock("@photo-sphere-viewer/core", () => ({
  Viewer: photoSphereViewerMocks.Viewer,
}));

describe("PanoramaViewer", () => {
  const originalUserAgent = window.navigator.userAgent;

  beforeEach(() => {
    photoSphereViewerMocks.Viewer.mockClear();
    photoSphereViewerMocks.instances.splice(0, photoSphereViewerMocks.instances.length);
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0",
    });
  });

  afterEach(() => {
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: originalUserAgent,
    });
    vi.restoreAllMocks();
  });

  it("keeps the same viewer instance when only the fov changes", async () => {
    const onStatusChange = vi.fn();
    const { rerender } = render(
      <PanoramaViewer
        imageUrl="https://cdn.test/panorama.jpg"
        fovDeg={70}
        label="360 全景查看器"
        onStatusChange={onStatusChange}
        selected
      />,
    );

    await waitFor(() => {
      expect(photoSphereViewerMocks.Viewer).toHaveBeenCalledTimes(1);
    });
    expect(onStatusChange.mock.calls.filter(([status]) => status === "loading")).toHaveLength(1);

    rerender(
      <PanoramaViewer
        imageUrl="https://cdn.test/panorama.jpg"
        fovDeg={90}
        label="360 全景查看器"
        onStatusChange={onStatusChange}
        selected
      />,
    );

    await waitFor(() => {
      expect(photoSphereViewerMocks.Viewer).toHaveBeenCalledTimes(1);
    });
    expect(onStatusChange.mock.calls.filter(([status]) => status === "loading")).toHaveLength(1);
  });
});
