import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Handle, NodeResizer, Position, useConnection, type NodeProps } from "@xyflow/react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  ChevronLeft,
  ChevronRight,
  Globe2,
  Grid2x2,
  Grid3x3,
  LoaderCircle,
  Maximize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { getAssetVariantUrl } from "../../services/v2AssetsApi";
import { PanoramaViewer, type PanoramaViewerHandle } from "../panorama/PanoramaViewer";
import { PanoramaViewerModal } from "../panorama/PanoramaViewerModal";
import {
  capturePanoramaOutputs,
  type PanoramaCaptureMode,
} from "../panorama/panoramaCapture";
import {
  clampPanoramaFov,
  getDefaultPanoramaViewerState,
  resolveDirectionYaw,
  wrapPanoramaDegrees,
  type PanoramaDirection,
} from "../panorama/panoramaViewerState";
import { getPanoramaSourceUrl } from "../panorama/panoramaUtils";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import type { FlowNodeData } from "../types";
import { FLOW_NODE_DEFAULT_SIZES } from "../utils/nodeSizing";

type PanoramaViewerNodeProps = NodeProps<FlowNodeData>;

type ViewerPosition = {
  pitchDeg: number;
  yawDeg: number;
};

type ViewerStatus = "loading" | "ready" | "error";

type ViewerState = {
  fovDeg: number;
  frontYawDeg: number;
  panelOpen: boolean;
  sphereCorrectionDeg: {
    pitch: number;
    roll: number;
    yaw: number;
  };
};

const DEFAULT_VIEWER_STATE = getDefaultPanoramaViewerState();
const DEG_TO_RAD = Math.PI / 180;
const DIRECTION_LABELS: Record<PanoramaDirection, string> = {
  front: "正前方",
  right: "右侧",
  back: "后方",
  left: "左侧",
  seam: "接缝",
};
const INVISIBLE_HANDLE_STYLE: React.CSSProperties = {
  background: "transparent",
  border: "none",
  height: 24,
  width: 24,
};

function readViewerState(data: FlowNodeData): ViewerState {
  return {
    fovDeg: clampPanoramaFov(Number(data.fovDeg ?? DEFAULT_VIEWER_STATE.fovDeg)),
    frontYawDeg: wrapPanoramaDegrees(Number(data.frontYawDeg ?? DEFAULT_VIEWER_STATE.frontYawDeg)),
    panelOpen: data.panelOpen ?? true,
    sphereCorrectionDeg: {
      pitch: Number(data.sphereCorrectionDeg?.pitch ?? DEFAULT_VIEWER_STATE.sphereCorrectionDeg.pitch),
      roll: Number(data.sphereCorrectionDeg?.roll ?? DEFAULT_VIEWER_STATE.sphereCorrectionDeg.roll),
      yaw: Number(data.sphereCorrectionDeg?.yaw ?? DEFAULT_VIEWER_STATE.sphereCorrectionDeg.yaw),
    },
  };
}

function waitForFrames(count = 2) {
  return new Promise<void>((resolve) => {
    let remaining = count;
    const step = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function fovToFocalMm(fovDeg: number) {
  return Math.round(18 / Math.tan((Math.max(5, Math.min(170, fovDeg)) / 2) * DEG_TO_RAD));
}

function getCaptureButtonLabel(mode: PanoramaCaptureMode) {
  if (mode === "grid_2x2") return "四视角截图";
  if (mode === "grid_4x3") return "十二视角截图";
  return "当前视角截图";
}

function ViewerControlButton({
  children,
  label,
  onClick,
  disabled,
  tone = "default",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  tone?: "default" | "accent";
}) {
  const toneClass =
    tone === "accent"
      ? "border-[rgba(96,165,250,0.28)] bg-[rgba(96,165,250,0.12)] text-sky-200 hover:bg-[rgba(96,165,250,0.2)]"
      : "border-white/10 bg-black/35 text-white/78 hover:bg-black/55 hover:text-white";

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      className={`nodrag inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
      title={label}
    >
      {children}
    </button>
  );
}

function RangeRow({
  label,
  max,
  min,
  onChange,
  step = 1,
  unit = "°",
  value,
  disabled,
}: {
  label: string;
  max: number;
  min: number;
  disabled?: boolean;
  onChange: (next: number) => void;
  step?: number;
  unit?: string;
  value: number;
}) {
  const handleInput = (raw: string) => {
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    onChange(Math.max(min, Math.min(max, next)));
  };

  return (
    <div className="flex w-full items-center gap-2 text-[11px] text-white/78">
      <span className="w-14 shrink-0 text-left font-medium text-white/62">{label}</span>
      <input
        aria-label={label}
        className="nodrag min-w-0 flex-1 accent-sky-400"
        disabled={disabled}
        min={min}
        max={max}
        onChange={(event) => handleInput(event.target.value)}
        onPointerDown={(event) => event.stopPropagation()}
        step={step}
        type="range"
        value={value}
      />
      <input
        aria-label={`${label} value`}
        className="nodrag h-7 w-[58px] rounded-[7px] border border-white/[0.12] bg-transparent px-1.5 text-right text-[11px] tabular-nums text-white/90 outline-none"
        disabled={disabled}
        min={min}
        max={max}
        onChange={(event) => handleInput(event.target.value)}
        onPointerDown={(event) => event.stopPropagation()}
        step={step}
        type="number"
        value={Number.isFinite(value) ? Number(value.toFixed(2)) : 0}
      />
      <span className="w-4 text-[11px] text-white/45">{unit}</span>
    </div>
  );
}

export const PanoramaViewerNode = memo(function PanoramaViewerNode({
  id,
  data,
  selected,
}: PanoramaViewerNodeProps) {
  const { connectionNodeId } = useConnection();
  const allNodes = useFlowCanvasStore((state) => state.nodes);
  const allEdges = useFlowCanvasStore((state) => state.edges);
  const backendProjectId = useFlowCanvasStore((state) => state.backendProjectId) as string | null | undefined;
  const addNode = useFlowCanvasStore((state) => state.addNode) as
    | ((kind: "image", position: { x: number; y: number }, overrides?: Partial<FlowNodeData>, options?: { preserveSelection?: boolean; selected?: boolean }) => { id: string })
    | undefined;
  const groupNodesAsPanoramaCaptureSet = useFlowCanvasStore((state) => state.groupNodesAsPanoramaCaptureSet) as
    | ((nodeIds: string[], groupTitle: string) => { groupId: string | null })
    | undefined;
  const updateNodeData = useFlowCanvasStore((state) => state.updateNodeData) as
    | ((nodeId: string, patch: Partial<FlowNodeData>) => void)
    | undefined;

  const [fallbackUrl, setFallbackUrl] = useState("");
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [captureMode, setCaptureMode] = useState<PanoramaCaptureMode | null>(null);
  const [statusText, setStatusText] = useState("");
  const [viewerState, setViewerState] = useState<ViewerState>(() => readViewerState(data));
  const [currentPosition, setCurrentPosition] = useState<ViewerPosition>({ pitchDeg: 0, yawDeg: 0 });

  const viewerRef = useRef<PanoramaViewerHandle | null>(null);
  const viewerStateRef = useRef(viewerState);
  const currentPositionRef = useRef(currentPosition);
  const captureLockedRef = useRef(false);

  const sourceNodeId = useMemo(() => {
    if (typeof data.panoramaSourceNodeId === "string" && data.panoramaSourceNodeId.trim()) {
      return data.panoramaSourceNodeId.trim();
    }
    return allEdges.find((edge) => edge.target === id)?.source || "";
  }, [allEdges, data.panoramaSourceNodeId, id]);

  const sourceNode = allNodes.find((node) => node.id === sourceNodeId);
  const viewerNode = allNodes.find((node) => node.id === id);
  const sourceData = sourceNode?.data;
  const directUrl = getPanoramaSourceUrl(sourceData);
  const imageUrl = directUrl || fallbackUrl;
  const width = Math.max(Number(data.width || FLOW_NODE_DEFAULT_SIZES.panoramaViewer.width), FLOW_NODE_DEFAULT_SIZES.panoramaViewer.width);
  const height = Math.max(Number(data.height || FLOW_NODE_DEFAULT_SIZES.panoramaViewer.height), FLOW_NODE_DEFAULT_SIZES.panoramaViewer.height);
  const isTargeting = !!connectionNodeId && connectionNodeId !== id;
  const viewerSelected = selected ?? true;

  useEffect(() => {
    setViewerState(readViewerState(data));
  }, [data.fovDeg, data.frontYawDeg, data.panelOpen, data.sphereCorrectionDeg]);

  useEffect(() => {
    viewerStateRef.current = viewerState;
  }, [viewerState]);

  useEffect(() => {
    currentPositionRef.current = currentPosition;
  }, [currentPosition]);

  useEffect(() => {
    if (!updateNodeData) return;

    const nextPatch: Partial<FlowNodeData> = {};
    const rawWidth = Number(data.width || 0);
    const rawHeight = Number(data.height || 0);
    if (!Number.isFinite(rawWidth) || rawWidth < FLOW_NODE_DEFAULT_SIZES.panoramaViewer.width) {
      nextPatch.width = FLOW_NODE_DEFAULT_SIZES.panoramaViewer.width;
    }
    if (!Number.isFinite(rawHeight) || rawHeight < FLOW_NODE_DEFAULT_SIZES.panoramaViewer.height) {
      nextPatch.height = FLOW_NODE_DEFAULT_SIZES.panoramaViewer.height;
    }

    if (Object.keys(nextPatch).length > 0) {
      updateNodeData(id, nextPatch);
    }
  }, [data.height, data.width, id, updateNodeData]);

  useEffect(() => {
    if (directUrl || !sourceData?.assetId) {
      setFallbackUrl("");
      return;
    }
    let cancelled = false;
    void getAssetVariantUrl(sourceData.assetId, "preview")
      .catch(() => getAssetVariantUrl(sourceData.assetId as string))
      .then((result) => {
        if (!cancelled) {
          setFallbackUrl(String(result.url || "").trim());
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFallbackUrl("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [directUrl, sourceData?.assetId]);

  const persistNodeData = useCallback(
    (patch: Partial<FlowNodeData>) => {
      updateNodeData?.(id, patch);
    },
    [id, updateNodeData],
  );

  const setPanelOpen = useCallback(
    (next: boolean) => {
      setViewerState((state) => ({ ...state, panelOpen: next }));
      persistNodeData({ panelOpen: next });
    },
    [persistNodeData],
  );

  const updateFov = useCallback(
    (next: number) => {
      const clamped = clampPanoramaFov(next);
      setViewerState((state) => ({ ...state, fovDeg: clamped }));
      persistNodeData({ fovDeg: clamped });
      viewerRef.current?.setFovDeg(clamped);
    },
    [persistNodeData],
  );

  const updateCorrectionAxis = useCallback(
    (axis: "roll" | "pitch" | "yaw", next: number) => {
      const correction = {
        ...viewerStateRef.current.sphereCorrectionDeg,
        [axis]: axis === "pitch" ? Math.max(-90, Math.min(90, next)) : wrapPanoramaDegrees(next),
      };
      setViewerState((state) => ({
        ...state,
        sphereCorrectionDeg: correction,
      }));
      persistNodeData({ sphereCorrectionDeg: correction });
    },
    [persistNodeData],
  );

  const syncFrontYaw = useCallback(
    (nextYaw: number) => {
      const wrapped = wrapPanoramaDegrees(nextYaw);
      setViewerState((state) => ({ ...state, frontYawDeg: wrapped }));
      persistNodeData({ frontYawDeg: wrapped });
    },
    [persistNodeData],
  );

  const rotateToDirection = useCallback(
    (direction: "front" | "right" | "back" | "left" | "seam") => {
      const yaw = resolveDirectionYaw(viewerStateRef.current.frontYawDeg, direction);
      viewerRef.current?.rotateTo(yaw, 0);
    },
    [],
  );

  const setFrontFromCurrentView = useCallback(() => {
    syncFrontYaw(currentPositionRef.current.yawDeg);
    setStatusText(`已设置正前方：${currentPositionRef.current.yawDeg.toFixed(1)}°`);
  }, [syncFrontYaw]);

  const lockCurrentView = useCallback(() => {
    const nextYaw = wrapPanoramaDegrees(currentPositionRef.current.yawDeg);
    syncFrontYaw(nextYaw);
    viewerRef.current?.rotateTo(0, 0);
    setStatusText("当前视角已锁定");
  }, [syncFrontYaw]);

  const resetCorrection = useCallback(() => {
    const nextCorrection = { pitch: 0, roll: 0, yaw: 0 };
    setViewerState((state) => ({
      ...state,
      sphereCorrectionDeg: nextCorrection,
    }));
    persistNodeData({ sphereCorrectionDeg: nextCorrection });
  }, [persistNodeData]);

  const resetView = useCallback(() => {
    viewerRef.current?.rotateTo(0, 0);
  }, []);

  const zoomBy = useCallback((delta: number) => {
    const next = viewerStateRef.current.fovDeg + delta;
    updateFov(next);
  }, [updateFov]);

  const handleViewerPositionChange = useCallback((position: ViewerPosition) => {
    if (captureLockedRef.current) return;
    setCurrentPosition(position);
  }, []);

  const handleViewerFovChange = useCallback((nextFovDeg: number) => {
    if (captureLockedRef.current) return;
    const clamped = clampPanoramaFov(nextFovDeg);
    setViewerState((state) => ({ ...state, fovDeg: clamped }));
    persistNodeData({ fovDeg: clamped });
  }, [persistNodeData]);

  const handleViewerStatusChange = useCallback((nextStatus: ViewerStatus) => {
    setStatusText(nextStatus === "ready" ? "已加载" : nextStatus === "loading" ? "正在加载全景图..." : "全景图加载失败");
  }, []);

  const handleCapture = useCallback(
    async (mode: PanoramaCaptureMode) => {
      if (!imageUrl || !viewerRef.current || !addNode || !groupNodesAsPanoramaCaptureSet) return;

      const savedPosition = currentPositionRef.current;
      const savedFov = viewerStateRef.current.fovDeg;
      const savedCorrection = viewerStateRef.current.sphereCorrectionDeg;
      const viewer = viewerRef.current;

      captureLockedRef.current = true;
      setCaptureMode(mode);
      setStatusText(`正在截取${getCaptureButtonLabel(mode)}...`);

      try {
        const result = await capturePanoramaOutputs({
          addImageNode: addNode,
          captureFrame: async ({ fovDeg, yawDeg, pitchDeg }) => {
            viewer.setFovDeg(fovDeg);
            viewer.rotateTo(yawDeg, pitchDeg);
            await waitForFrames(2);
            const canvas = viewer.getCanvas();
            if (!canvas) {
              throw new Error("Panorama canvas is unavailable");
            }
            return {
              dataUrl: canvas.toDataURL("image/png"),
              height: canvas.height,
              width: canvas.width,
            };
          },
          captureMode: mode,
          currentFovDeg: savedFov,
          frontYawDeg: viewerStateRef.current.frontYawDeg,
          groupNodesAsPanoramaCaptureSet,
          origin: {
            x: Number(viewerNode?.position.x ?? 0) + width + 220,
            y: Number(viewerNode?.position.y ?? 0),
          },
          projectId: backendProjectId ?? null,
          sourceAssetId: sourceData?.assetId,
          sourceNodeId: sourceNodeId || id,
          sourceTitle: String(sourceData?.title || data.title || "360 全景"),
          viewerNodeId: id,
        });

        setStatusText(
          result.groupId
            ? `${result.nodeIds.length} captures created and grouped`
            : `${result.nodeIds.length} capture created`,
        );
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : "截图失败");
      } finally {
        viewer.setFovDeg(savedFov);
        viewer.rotateTo(savedPosition.yawDeg, savedPosition.pitchDeg);
        await waitForFrames(2);
        setViewerState((state) => ({
          ...state,
          fovDeg: savedFov,
          sphereCorrectionDeg: savedCorrection,
        }));
        setCurrentPosition(savedPosition);
        captureLockedRef.current = false;
        setCaptureMode(null);
      }
    },
    [
      addNode,
      backendProjectId,
      data.height,
      data.title,
      data.width,
      groupNodesAsPanoramaCaptureSet,
      id,
      imageUrl,
      viewerNode?.position.x,
      viewerNode?.position.y,
      sourceData?.assetId,
      sourceData?.title,
      sourceNodeId,
    ],
  );

  const cardStyle: React.CSSProperties = {
    background: "#282828",
    border: selected ? "1.5px solid rgba(255,255,255,0.4)" : isTargeting ? "1.5px solid rgba(34,197,94,0.72)" : "1.5px solid rgba(255,255,255,0.04)",
    borderRadius: 18,
    boxShadow: selected ? "0 10px 34px rgba(0,0,0,0.45)" : "0 6px 22px rgba(0,0,0,0.28)",
    height: "100%",
    overflow: "hidden",
    position: "relative",
    width: "100%",
  };

  const liveFov = viewerState.fovDeg;
  const focalMm = Number.isFinite(liveFov) ? fovToFocalMm(liveFov) : null;
  const title = String(data.title || "360 全景查看器");

  return (
    <div style={{ height: "100%", position: "relative", width: "100%" }}>
      <NodeResizer
        handleStyle={{ background: "transparent", borderColor: "transparent" }}
        lineStyle={{ borderColor: "rgba(255,255,255,0.36)" }}
        minHeight={FLOW_NODE_DEFAULT_SIZES.panoramaViewer.height}
        minWidth={FLOW_NODE_DEFAULT_SIZES.panoramaViewer.width}
      />

      <div
        style={{
          alignItems: "center",
          color: "#e5e7eb",
          display: "flex",
          fontSize: 12,
          fontWeight: 700,
          gap: 6,
          left: 0,
          position: "absolute",
          top: "calc(100% + 6px)",
        }}
      >
        <Globe2 size={14} />
        <span>{title}</span>
      </div>

      <Handle type="target" position={Position.Left} id="in" style={{ ...INVISIBLE_HANDLE_STYLE, left: -2 }} />

      <div style={{ ...cardStyle, width, height }}>
        {imageUrl ? (
          <div className="flex h-full w-full overflow-hidden">
            <div className="relative min-w-0 flex-1">
              <PanoramaViewer
                className="absolute inset-0 h-full w-full"
                fovDeg={viewerState.fovDeg}
                imageUrl={imageUrl}
                label={title}
                onFovChange={handleViewerFovChange}
                onPositionChange={handleViewerPositionChange}
                onStatusChange={handleViewerStatusChange}
                selected={viewerSelected}
                sphereCorrectionDeg={viewerState.sphereCorrectionDeg}
                ref={viewerRef}
              />

              <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/34 px-2.5 py-1 text-[10px] tabular-nums text-white/74 backdrop-blur-sm">
                方位 {currentPosition.yawDeg.toFixed(1)}° · 俯仰 {currentPosition.pitchDeg.toFixed(1)}° · 视角 {liveFov.toFixed(0)}°{focalMm ? ` · ${focalMm}mm` : ""}
              </div>

              <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/[0.08] bg-black/32 px-1.5 py-1 backdrop-blur-sm">
                <ViewerControlButton
                  disabled={captureMode !== null}
                  label="当前视角截图"
                  onClick={() => void handleCapture("current")}
                >
                  {captureMode === "current" ? <LoaderCircle className="animate-spin" size={16} /> : <Camera size={16} />}
                </ViewerControlButton>
                <ViewerControlButton
                  disabled={captureMode !== null}
                  label="四视角截图"
                  onClick={() => void handleCapture("grid_2x2")}
                >
                  <Grid2x2 size={16} />
                </ViewerControlButton>
                <ViewerControlButton
                  disabled={captureMode !== null}
                  label="十二视角截图"
                  onClick={() => void handleCapture("grid_4x3")}
                >
                  <Grid3x3 size={16} />
                </ViewerControlButton>
              </div>

              <div
                className="nodrag absolute bottom-3 left-3 flex items-center gap-1 rounded-full border border-white/[0.08] bg-black/28 px-1.5 py-1 backdrop-blur-sm"
                onPointerDown={(event) => event.stopPropagation()}
                onWheel={(event) => event.stopPropagation()}
              >
                <ViewerControlButton disabled={captureMode !== null} label="缩小" onClick={() => zoomBy(10)}>
                  <ZoomOut size={16} strokeWidth={1.8} />
                </ViewerControlButton>
                <ViewerControlButton disabled={captureMode !== null} label="放大" onClick={() => zoomBy(-10)}>
                  <ZoomIn size={16} strokeWidth={1.8} />
                </ViewerControlButton>
                <ViewerControlButton disabled={captureMode !== null} label="左转" onClick={() => viewerRef.current?.rotateBy(-12, 0)}>
                  <ArrowLeft size={16} strokeWidth={1.8} />
                </ViewerControlButton>
                <ViewerControlButton disabled={captureMode !== null} label="右转" onClick={() => viewerRef.current?.rotateBy(12, 0)}>
                  <ArrowRight size={16} strokeWidth={1.8} />
                </ViewerControlButton>
                <ViewerControlButton disabled={captureMode !== null} label="上移" onClick={() => viewerRef.current?.rotateBy(0, 8)}>
                  <ArrowUp size={16} strokeWidth={1.8} />
                </ViewerControlButton>
                <ViewerControlButton disabled={captureMode !== null} label="下移" onClick={() => viewerRef.current?.rotateBy(0, -8)}>
                  <ArrowDown size={16} strokeWidth={1.8} />
                </ViewerControlButton>
                <ViewerControlButton disabled={captureMode !== null} label="全屏查看" onClick={() => setFullscreenOpen(true)}>
                  <Maximize2 size={16} strokeWidth={1.8} />
                </ViewerControlButton>
                <ViewerControlButton disabled={captureMode !== null} label="重置视角" onClick={resetView}>
                  <RotateCcw size={16} strokeWidth={1.8} />
                </ViewerControlButton>
              </div>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setPanelOpen(!viewerState.panelOpen);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                title={viewerState.panelOpen ? "收起控制面板" : "展开控制面板"}
                aria-label={viewerState.panelOpen ? "收起控制面板" : "展开控制面板"}
                className="nodrag absolute right-2 top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.1] bg-black/35 text-white/72 backdrop-blur-sm transition-colors hover:bg-black/50 hover:text-white"
              >
                {viewerState.panelOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>
            </div>

            {viewerState.panelOpen ? (
              <aside
                className="flex h-full w-[336px] shrink-0 flex-col gap-4 overflow-y-auto overflow-x-hidden border-l border-white/[0.08] bg-[#191a1f]/94 p-4 text-[12px] text-white/88 backdrop-blur-sm"
                onWheel={(event) => event.stopPropagation()}
              >
                <section className="flex flex-col gap-2">
                  <header className="flex items-center justify-between gap-3 text-[11px] font-medium text-white/70">
                    <span>视角</span>
                    <span className="tabular-nums text-white/55">
                      {liveFov.toFixed(0)}° · {focalMm ?? "?"}mm
                    </span>
                  </header>
                  <RangeRow
                    disabled={captureMode !== null}
                    label="视角"
                    max={170}
                    min={5}
                    onChange={updateFov}
                    step={1}
                    unit="°"
                    value={liveFov}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {[20, 35, 50, 70, 90, 120, 150].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        disabled={captureMode !== null}
                        onClick={(event) => {
                          event.stopPropagation();
                          updateFov(preset);
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        className="nodrag inline-flex h-7 items-center gap-1 rounded-full border border-white/[0.12] bg-transparent px-2.5 text-[11px] text-white/72 transition-colors hover:border-white/[0.2] hover:bg-white/[0.06] hover:text-white"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="flex flex-col gap-2">
                  <header className="flex items-center justify-between gap-3 text-[11px] font-medium text-white/70">
                    <span>球面校正</span>
                    <button
                      type="button"
                      disabled={captureMode !== null}
                      className="nodrag rounded-full px-2 py-1 text-[11px] text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white"
                      onClick={(event) => {
                        event.stopPropagation();
                        resetCorrection();
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      重置
                    </button>
                  </header>
                  <RangeRow
                    disabled={captureMode !== null}
                    label="滚转"
                    max={180}
                    min={-180}
                    onChange={(next) => updateCorrectionAxis("roll", next)}
                    value={viewerState.sphereCorrectionDeg.roll}
                  />
                  <RangeRow
                    disabled={captureMode !== null}
                    label="俯仰"
                    max={90}
                    min={-90}
                    onChange={(next) => updateCorrectionAxis("pitch", next)}
                    value={viewerState.sphereCorrectionDeg.pitch}
                  />
                  <RangeRow
                    disabled={captureMode !== null}
                    label="方位"
                    max={180}
                    min={-180}
                    onChange={(next) => updateCorrectionAxis("yaw", next)}
                    value={viewerState.sphereCorrectionDeg.yaw}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    <button
                    type="button"
                    disabled={captureMode !== null}
                    className="nodrag inline-flex h-7 items-center gap-1 rounded-full border border-white/[0.12] bg-transparent px-2.5 text-[11px] text-white/72 transition-colors hover:border-white/[0.2] hover:bg-white/[0.06] hover:text-white"
                    onClick={(event) => {
                      event.stopPropagation();
                      lockCurrentView();
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      锁定当前视角
                    </button>
                  </div>
                </section>

                <section className="flex flex-col gap-2">
                  <header className="flex items-center justify-between gap-3 text-[11px] font-medium text-white/70">
                    <span>正前方</span>
                    <span className="tabular-nums text-white/55">{viewerState.frontYawDeg.toFixed(1)}°</span>
                  </header>
                  <RangeRow
                    label="前向"
                    max={180}
                    min={-180}
                    onChange={syncFrontYaw}
                    value={viewerState.frontYawDeg}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    <button
                    type="button"
                    disabled={captureMode !== null}
                    className="nodrag inline-flex h-7 items-center gap-1 rounded-full border border-white/[0.12] bg-transparent px-2.5 text-[11px] text-white/72 transition-colors hover:border-white/[0.2] hover:bg-white/[0.06] hover:text-white"
                    onClick={(event) => {
                      event.stopPropagation();
                      setFrontFromCurrentView();
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      设为当前视角
                    </button>
                    {(["front", "right", "back", "left", "seam"] as const).map((direction) => (
                      <button
                        key={direction}
                        type="button"
                        disabled={captureMode !== null}
                        className="nodrag inline-flex h-7 items-center gap-1 rounded-full border border-white/[0.12] bg-transparent px-2.5 text-[11px] text-white/72 transition-colors hover:border-white/[0.2] hover:bg-white/[0.06] hover:text-white"
                        onClick={(event) => {
                          event.stopPropagation();
                          rotateToDirection(direction);
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        {DIRECTION_LABELS[direction]}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="flex flex-col gap-2">
                  <header className="text-[11px] font-medium text-white/70">状态</header>
                  <div className="rounded-lg border border-white/[0.08] bg-black/24 px-3 py-2 text-[11px] text-white/58">
                    {statusText || (imageUrl ? "已加载" : "等待全景图源")}
                  </div>
                </section>
              </aside>
            ) : null}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-white/70">
            <Globe2 size={20} />
            <div className="text-sm font-medium">请先连接全景图片以开始查看</div>
          </div>
        )}
      </div>

      {fullscreenOpen && imageUrl ? (
        <PanoramaViewerModal
          imageUrl={imageUrl}
          onClose={() => setFullscreenOpen(false)}
          title={String(data.title || sourceData?.title || "360 全景查看器")}
        />
      ) : null}
    </div>
  );
});

PanoramaViewerNode.displayName = "PanoramaViewerNode";
