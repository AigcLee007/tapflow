import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, Cloud, Loader2, RefreshCw } from "lucide-react";

import { getAsset } from "../assets/assetApi";
import { V2HttpError } from "../services/v2HttpClient";
import FlowCanvasPage from "./FlowCanvasPage";
import { useRemoteFlowAutosave, type RemoteFlowSaveStatus } from "./hooks/useRemoteFlowAutosave";
import { useRemoteFlowProject } from "./hooks/useRemoteFlowProject";
import { useFlowCanvasStore } from "./store/flowCanvasStore";
import type { FlowNodeKind } from "./types";
import { buildAssetBackedNodeData } from "./utils/assetNodeData";

function getProjectIdFromLocation() {
  if (typeof window === "undefined") return "";
  const match = window.location.pathname.match(/^\/projects\/([^/]+)/);
  return decodeURIComponent(match?.[1] ?? "");
}

function statusLabel(status: RemoteFlowSaveStatus) {
  if (status === "syncing") return "Syncing";
  if (status === "retrying") return "Syncing";
  if (status === "saved") return "Saved";
  if (status === "dirty" || status === "pending_sync") return "Pending sync";
  if (status === "failed") return "Offline changes";
  return "Ready";
}

function StatusIcon({ status }: { status: RemoteFlowSaveStatus }) {
  if (status === "syncing" || status === "retrying") return <Loader2 className="animate-spin" size={15} />;
  if (status === "dirty" || status === "pending_sync" || status === "failed") return <Cloud size={15} />;
  if (status === "saved") return <CheckCircle2 size={15} />;
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
  const [insertError, setInsertError] = useState<string | null>(null);
  const [insertRetryTick, setInsertRetryTick] = useState(0);
  const [locationSearch, setLocationSearch] = useState(() =>
    typeof window === "undefined" ? "" : window.location.search,
  );
  const autosave = useRemoteFlowAutosave({
    draft: projectState.draft,
    enabled: !projectState.loading && !projectState.error,
    flowId: projectState.flow?.id ?? null,
  });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleLocationChange = () => setLocationSearch(window.location.search);
    window.addEventListener("popstate", handleLocationChange);
    return () => window.removeEventListener("popstate", handleLocationChange);
  }, []);

  useEffect(() => {
    if (projectState.loading || projectState.error) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(locationSearch);
    const insertAssetId = params.get("insertAssetId");
    if (!insertAssetId || insertedAssetIdRef.current === insertAssetId) return;

    insertedAssetIdRef.current = insertAssetId;
    setInsertError(null);

    void getAsset(insertAssetId)
      .then((asset) => {
        const zoom = viewport.zoom || 1;
        const center = {
          x: (window.innerWidth / 2 - viewport.x) / zoom + nodes.length * 24,
          y: (window.innerHeight / 2 - viewport.y) / zoom + nodes.length * 24,
        };

        addNode(
          kindForAsset(asset.kind),
          center,
          buildAssetBackedNodeData(asset, {
            source: "asset-library",
            title: asset.title || asset.originalFilename || "Cloud asset",
          }),
          { selected: true },
        );

        const nextParams = new URLSearchParams(window.location.search);
        nextParams.delete("insertAssetId");
        const nextQuery = nextParams.toString();
        const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
        window.history.replaceState(null, "", nextUrl);
        setLocationSearch(window.location.search);
      })
      .catch((error) => {
        insertedAssetIdRef.current = null;
        setInsertError(getAssetInsertErrorMessage(error));
      });
  }, [
    addNode,
    insertRetryTick,
    locationSearch,
    nodes.length,
    projectState.error,
    projectState.loading,
    viewport,
  ]);

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
        <span
          className={`inline-flex items-center gap-1.5 ${
            autosave.status === "failed"
              ? "text-amber-200"
              : autosave.status === "saved"
                ? "text-emerald-200"
                : autosave.status === "retrying" || autosave.status === "pending_sync"
                  ? "text-amber-200"
                : "text-sky-200"
          }`}
        >
          <StatusIcon status={autosave.status} />
          {statusLabel(autosave.status)}
        </span>
        {autosave.status === "failed" && (
          <button
            className="inline-flex h-7 items-center gap-1 rounded-full border border-amber-300/20 px-2 text-amber-100 hover:bg-amber-400/10"
            onClick={autosave.saveNow}
            title={autosave.error || "Retry cloud sync"}
            type="button"
          >
            <RefreshCw size={13} />
            Retry
          </button>
        )}
      </div>
      {insertError && (
        <div className="fixed right-4 top-32 z-[1200] max-w-sm rounded border border-amber-300/20 bg-amber-950/90 px-4 py-3 text-sm text-amber-100 shadow-xl">
          <div>{insertError}</div>
          <button
            className="mt-3 inline-flex h-8 items-center gap-2 rounded border border-amber-200/20 px-3 text-xs font-semibold text-amber-50 hover:bg-amber-300/10"
            onClick={() => setInsertRetryTick((tick) => tick + 1)}
            type="button"
          >
            <RefreshCw size={13} />
            Retry insert
          </button>
        </div>
      )}
    </>
  );
}

function getAssetInsertErrorMessage(error: unknown) {
  if (error instanceof V2HttpError) {
    if (error.status === 401) return "Asset insert failed because your session expired. Please log in again.";
    if (error.status === 404) return "Asset insert failed because the selected asset could not be found.";
    if (error.status >= 500) return "Asset insert failed because the server could not load the asset right now.";
    return error.message || "Asset insert failed.";
  }
  if (error instanceof Error && /failed to fetch/i.test(error.message)) {
    return "Asset insert failed because the app could not reach the API.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Asset insert failed.";
}
