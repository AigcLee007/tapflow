import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Expand, LoaderCircle } from "lucide-react";
import "@photo-sphere-viewer/core/index.css";

import { clampPanoramaFov, getDefaultPanoramaViewerState } from "./panoramaViewerState";

type PanoramaViewerStatus = "loading" | "ready" | "error";

type PanoramaViewerPosition = {
  pitchDeg: number;
  yawDeg: number;
};

export type PanoramaViewerHandle = {
  getCanvas: () => HTMLCanvasElement | null;
  requestFullscreen: () => void;
  rotateBy: (yawDeltaDeg: number, pitchDeltaDeg: number) => void;
  rotateTo: (yawDeg: number, pitchDeg: number) => void;
  setFovDeg: (value: number) => void;
};

export type PanoramaViewerProps = {
  className?: string;
  fovDeg?: number;
  imageUrl: string;
  label?: string;
  onFovChange?: (fovDeg: number) => void;
  onPositionChange?: (position: PanoramaViewerPosition) => void;
  onStatusChange?: (status: PanoramaViewerStatus) => void;
  selected?: boolean;
  sphereCorrectionDeg?: {
    pitch: number;
    roll: number;
    yaw: number;
  };
};

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const FOV_MIN = 5;
const FOV_MAX = 170;
const DEFAULT_FOV = getDefaultPanoramaViewerState().fovDeg;

function isJsdom() {
  return (
    typeof window !== "undefined" &&
    typeof window.navigator !== "undefined" &&
    /jsdom/i.test(window.navigator.userAgent)
  );
}

function fovToZoomLevel(fovDeg: number) {
  const clamped = clampPanoramaFov(fovDeg);
  return ((FOV_MAX - clamped) / (FOV_MAX - FOV_MIN)) * 100;
}

function zoomLevelToFov(zoomLevel: number) {
  return clampPanoramaFov(FOV_MAX - (zoomLevel / 100) * (FOV_MAX - FOV_MIN));
}

function radiansToDegrees(value: number) {
  return value * RAD_TO_DEG;
}

function degreesToRadians(value: number) {
  return value * DEG_TO_RAD;
}

function normalizeSphereCorrection(
  value: PanoramaViewerProps["sphereCorrectionDeg"],
): {
  pitch: number;
  roll: number;
  yaw: number;
} {
  return {
    pitch: Number(value?.pitch || 0),
    roll: Number(value?.roll || 0),
    yaw: Number(value?.yaw || 0),
  };
}

export const PanoramaViewer = forwardRef<PanoramaViewerHandle, PanoramaViewerProps>(function PanoramaViewer(
  {
    className,
    fovDeg = DEFAULT_FOV,
    imageUrl,
    label = "360 全景",
    onFovChange,
    onPositionChange,
    onStatusChange,
    selected,
    sphereCorrectionDeg,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<{ destroy?: () => void; getPosition?: () => { pitch: number; yaw: number }; rotate?: (position: { pitch: number; yaw: number }) => void; setOption?: (key: string, value: unknown) => void; state?: { ready?: boolean }; toggleFullscreen?: () => void; zoom?: (value: number) => void } | null>(null);
  const pendingFovRef = useRef(clampPanoramaFov(fovDeg));
  const pendingCorrectionRef = useRef(normalizeSphereCorrection(sphereCorrectionDeg));
  const [status, setStatus] = useState<PanoramaViewerStatus>(imageUrl ? "loading" : "error");

  const emitStatus = useCallback(
    (nextStatus: PanoramaViewerStatus) => {
      setStatus(nextStatus);
      onStatusChange?.(nextStatus);
    },
    [onStatusChange],
  );

  const emitPosition = useCallback(
    (position: { pitch: number; yaw: number }) => {
      onPositionChange?.({
        pitchDeg: radiansToDegrees(position.pitch),
        yawDeg: radiansToDegrees(position.yaw),
      });
    },
    [onPositionChange],
  );

  const emitFov = useCallback(
    (zoomLevel: number) => {
      onFovChange?.(zoomLevelToFov(zoomLevel));
    },
    [onFovChange],
  );

  const applyCorrection = useCallback(
    (viewer: { setOption?: (key: string, value: unknown) => void; state?: { ready?: boolean } } | null) => {
      if (!viewer?.state?.ready || !viewer.setOption) return;
      const correction = pendingCorrectionRef.current;
      viewer.setOption("sphereCorrection", {
        pan: correction.yaw * DEG_TO_RAD,
        tilt: correction.pitch * DEG_TO_RAD,
        roll: correction.roll * DEG_TO_RAD,
      });
    },
    [],
  );

  const applyFov = useCallback(
    (viewer: { zoom?: (value: number) => void; state?: { ready?: boolean } } | null, nextFovDeg: number) => {
      if (!viewer?.state?.ready || !viewer.zoom) return;
      const clamped = clampPanoramaFov(nextFovDeg);
      pendingFovRef.current = clamped;
      viewer.zoom(fovToZoomLevel(clamped));
      onFovChange?.(clamped);
    },
    [onFovChange],
  );

  const requestFullscreen = useCallback(() => {
    const viewer = viewerRef.current;
    if (viewer?.toggleFullscreen) {
      viewer.toggleFullscreen();
      return;
    }
    const result = containerRef.current?.requestFullscreen?.();
    if (result && typeof (result as Promise<void>).catch === "function") {
      void (result as Promise<void>).catch(() => undefined);
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      getCanvas: () => containerRef.current?.querySelector("canvas") ?? null,
      requestFullscreen,
      rotateBy: (yawDeltaDeg, pitchDeltaDeg) => {
        const viewer = viewerRef.current;
        const position = viewer?.getPosition?.();
        if (!viewer || !position || !viewer.rotate) return;
        viewer.rotate({
          pitch: position.pitch + degreesToRadians(pitchDeltaDeg),
          yaw: position.yaw + degreesToRadians(yawDeltaDeg),
        });
      },
      rotateTo: (yawDeg, pitchDeg) => {
        const viewer = viewerRef.current;
        if (!viewer?.rotate) return;
        viewer.rotate({
          pitch: degreesToRadians(pitchDeg),
          yaw: degreesToRadians(yawDeg),
        });
      },
      setFovDeg: (value: number) => {
        applyFov(viewerRef.current, value);
      },
    }),
    [applyFov, requestFullscreen],
  );

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    applyCorrection(viewer);
  }, [applyCorrection, sphereCorrectionDeg]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    applyFov(viewer, fovDeg);
  }, [applyFov, fovDeg]);

  useEffect(() => {
    pendingCorrectionRef.current = normalizeSphereCorrection(sphereCorrectionDeg);
  }, [sphereCorrectionDeg]);

  useEffect(() => {
    pendingFovRef.current = clampPanoramaFov(fovDeg);
  }, [fovDeg]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer?.setOption) return;
    const enabled = selected ?? true;
    viewer.setOption("mousemove", enabled);
    viewer.setOption("mousewheel", enabled);
  }, [selected]);

  useEffect(() => {
    if (!imageUrl) {
      viewerRef.current?.destroy?.();
      viewerRef.current = null;
      emitStatus("error");
      return;
    }

    if (isJsdom()) {
      emitStatus("ready");
      emitPosition({ pitch: 0, yaw: 0 });
      onFovChange?.(clampPanoramaFov(fovDeg));
      return;
    }

    let cancelled = false;
    let viewer: {
      addEventListener?: (event: string, handler: (payload: any) => void) => void;
      destroy?: () => void;
      getPosition?: () => { pitch: number; yaw: number };
      rotate?: (position: { pitch: number; yaw: number }) => void;
      setOption?: (key: string, value: unknown) => void;
      state?: { ready?: boolean };
      toggleFullscreen?: () => void;
      zoom?: (value: number) => void;
    } | null = null;

    emitStatus("loading");

    void import("@photo-sphere-viewer/core")
      .then(({ Viewer }) => {
        if (cancelled || !containerRef.current) return;
        viewer = new Viewer({
          container: containerRef.current,
          defaultTransition: null as unknown as undefined,
          defaultZoomLvl: fovToZoomLevel(pendingFovRef.current),
          keyboard: "fullscreen",
          maxFov: FOV_MAX,
          minFov: FOV_MIN,
          mousemove: selected ?? true,
          mousewheel: selected ?? true,
          navbar: false,
          panorama: imageUrl,
          rendererParameters: { preserveDrawingBuffer: true },
          touchmoveTwoFingers: false,
        }) as unknown as typeof viewer;
        viewerRef.current = viewer;

        viewer?.addEventListener?.("ready", () => {
          if (cancelled || !viewer) return;
          emitStatus("ready");
          applyCorrection(viewer);
          applyFov(viewer, pendingFovRef.current);
          emitPosition(viewer.getPosition?.() ?? { pitch: 0, yaw: 0 });
        });

        viewer?.addEventListener?.("position-updated", ({ position }: { position: { pitch: number; yaw: number } }) => {
          if (cancelled) return;
          emitPosition(position);
        });

        viewer?.addEventListener?.("zoom-updated", ({ zoomLevel }: { zoomLevel: number }) => {
          if (cancelled) return;
          emitFov(zoomLevel);
        });
      })
      .catch((error) => {
        if (cancelled) return;
        emitStatus("error");
        console.error("Photo Sphere Viewer failed to load", error);
      });

    return () => {
      cancelled = true;
      viewer?.destroy?.();
      viewerRef.current = null;
    };
  }, [applyCorrection, applyFov, emitPosition, emitStatus, fovDeg, imageUrl, onFovChange, selected]);

  const overlay = useMemo(() => {
    if (status === "ready") return null;
    return (
      <div
        className="absolute inset-0 flex items-center justify-center bg-black/45 text-white"
        style={{ backdropFilter: "blur(3px)" }}
      >
        {status === "loading" ? (
          <div className="flex items-center gap-2 text-sm font-medium">
            <LoaderCircle className="animate-spin" size={16} />
            Loading panorama...
          </div>
        ) : (
          <div className="text-sm font-medium text-white/70">Panorama failed to load</div>
        )}
      </div>
    );
  }, [status]);

  return (
    <div
      className={className}
      data-testid="panorama-viewer-shell"
      style={{
        background: "#020617",
        borderRadius: 16,
        height: "100%",
        minHeight: 180,
        overflow: "hidden",
        position: "relative",
        width: "100%",
      }}
    >
      <div
        ref={containerRef}
        style={{
          backgroundImage: status === "ready" && isJsdom() ? `url(${imageUrl})` : undefined,
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
          height: "100%",
          width: "100%",
        }}
      />
      <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/60 px-3 py-1 text-xs font-semibold text-white/90">
        {label}
      </div>
      <button
        type="button"
        aria-label="Fullscreen panorama"
        onClick={requestFullscreen}
        className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/60 text-white/90 transition hover:bg-black/80"
      >
        <Expand size={16} />
      </button>
      {overlay}
    </div>
  );
});

PanoramaViewer.displayName = "PanoramaViewer";
