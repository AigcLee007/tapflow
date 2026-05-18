import React, { useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle2, Cloud, Loader2, RefreshCw } from "lucide-react";

import FlowCanvasPage from "./FlowCanvasPage";
import { getAsset } from "../assets/assetApi";
import { useRemoteFlowAutosave, type RemoteFlowSaveStatus } from "./hooks/useRemoteFlowAutosave";
import { useRemoteFlowProject } from "./hooks/useRemoteFlowProject";
import { useFlowCanvasStore } from "./store/flowCanvasStore";
import type { FlowNodeKind } from "./types";

function getProjectIdFromLocation() {
  if (typeof window === "undefined") return "";
  const match = window.location.pathname.match(/^\/projects\/([^/]+)/);
  return decodeURIComponent(match?.[1] ?? "");
}

function statusLabel(status: RemoteFlowSaveStatus) {
  if (status === "saving") return "保存中";
  if (status === "saved") return "已保存";
  if (status === "dirty") return "保存中";
  if (status === "error") return "保存失败";
  return "未修改";
}

function StatusIcon({ status }: { status: RemoteFlowSaveStatus }) {
  if (status === "saving" || status === "dirty") return <Loader2 className="animate-spin" size={15} />;
  if (status === "saved") return <CheckCircle2 size={15} />;
  if (status === "error") return <AlertTriangle size={15} />;
  return <Cloud size={15} />;
}

function LoadingState() {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#09090f] text-slate-200">
      <div className="flex items-center gap-3 rounded border border-white/10 bg-white/[0.04] px-5 py-4 text-sm">
        <Loader2 className="animate-spin text-sky-300" size={18} />
        Loading project canvas...
      </div>
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#09090f] px-4 text-slate-200">
      <section className="w-full max-w-xl rounded border border-red-400/20 bg-red-500/10 p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-red-200">
          <AlertTriangle size={18} />
          Unable to load project canvas
        </div>
        <p className="mt-3 text-sm leading-6 text-red-100/80">{error}</p>
        <button
          className="mt-5 inline-flex h-10 items-center gap-2 rounded bg-white px-4 text-sm font-semibold text-slate-950 hover:bg-slate-200"
          onClick={onRetry}
          type="button"
        >
          <RefreshCw size={16} />
          Retry
        </button>
      </section>
    </div>
  );
}

function kindForAsset(assetKind: string): FlowNodeKind {
  if (assetKind === "video") return "video";
  if (assetKind === "audio") return "audio";
  if (assetKind === "image") return "image";
  return "upload";
}

export function FlowProjectPage() {
  const projectId = getProjectIdFromLocation();
  const projectState = useRemoteFlowProject(projectId);
  const addNode = useFlowCanvasStore((state) => state.addNode);
  const nodes = useFlowCanvasStore((state) => state.nodes);
  const viewport = useFlowCanvasStore((state) => state.viewport);
  const insertedAssetIdRef = useRef<string | null>(null);
  const autosave = useRemoteFlowAutosave({
    draft: projectState.draft,
    enabled: !projectState.loading && !projectState.error,
    flowId: projectState.flow?.id ?? null,
  });

  useEffect(() => {
    if (projectState.loading || projectState.error) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const insertAssetId = params.get("insertAssetId");
    if (!insertAssetId || insertedAssetIdRef.current === insertAssetId) return;
    insertedAssetIdRef.current = insertAssetId;

    void getAsset(insertAssetId)
      .then((asset) => {
        const zoom = viewport.zoom || 1;
        const center = {
          x: (window.innerWidth / 2 - viewport.x) / zoom + nodes.length * 24,
          y: (window.innerHeight / 2 - viewport.y) / zoom + nodes.length * 24,
        };
        const assetData = {
          assetId: asset.id,
          assetIds: [asset.id],
          mimeType: asset.mimeType,
          source: "asset-library",
          title: asset.title || asset.originalFilename || "Cloud asset",
          ...(asset.durationMs !== null ? { durationMs: asset.durationMs } : {}),
          ...(asset.height !== null ? { height: asset.height, naturalHeight: asset.height } : {}),
          ...(asset.width !== null ? { naturalWidth: asset.width, width: asset.width } : {}),
        };
        addNode(kindForAsset(asset.kind), center, {
          ...assetData,
        }, { selected: true });
      })
      .finally(() => {
        const nextParams = new URLSearchParams(window.location.search);
        nextParams.delete("insertAssetId");
        const nextQuery = nextParams.toString();
        const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
        window.history.replaceState(null, "", nextUrl);
      });
  }, [addNode, nodes.length, projectState.error, projectState.loading, viewport]);

  if (!projectId) {
    return <ErrorState error="Project ID is missing from the URL." onRetry={() => window.location.assign("/workspace")} />;
  }

  if (projectState.loading) {
    return <LoadingState />;
  }

  if (projectState.error) {
    return <ErrorState error={projectState.error} onRetry={() => void projectState.reload()} />;
  }

  return (
    <>
      <FlowCanvasPage enableLocalPersistence={false} />
      <div className="fixed left-1/2 top-4 z-[1200] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-zinc-950/88 px-4 py-2 text-xs text-slate-300 shadow-2xl backdrop-blur">
        <span className="max-w-[220px] truncate font-medium text-white">
          {projectState.project?.name || "Project Flow"}
        </span>
        <span className="hidden h-4 w-px bg-white/12 sm:block" />
        <span className="hidden max-w-[180px] truncate text-slate-500 sm:block">
          {projectState.flow?.title || projectState.flow?.id}
        </span>
        <span className={`inline-flex items-center gap-1.5 ${
          autosave.status === "error" ? "text-red-200" : autosave.status === "saved" ? "text-emerald-200" : "text-sky-200"
        }`}>
          <StatusIcon status={autosave.status} />
          {statusLabel(autosave.status)}
        </span>
        {autosave.status === "error" && (
          <button
            className="inline-flex h-7 items-center gap-1 rounded-full border border-red-300/20 px-2 text-red-100 hover:bg-red-400/10"
            onClick={autosave.saveNow}
            title={autosave.error || "Retry save"}
            type="button"
          >
            <RefreshCw size={13} />
            Retry
          </button>
        )}
      </div>
      {autosave.error && (
        <div className="fixed right-4 top-16 z-[1200] max-w-sm rounded border border-red-300/20 bg-red-950/90 px-4 py-3 text-sm text-red-100 shadow-xl">
          {autosave.error}
        </div>
      )}
    </>
  );
}
