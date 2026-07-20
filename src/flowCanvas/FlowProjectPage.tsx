import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Cloud, Loader2, RefreshCw } from "lucide-react";

import { getAsset } from "../assets/assetApi";
import { BrandTransition } from "../app/brand/BrandTransition";
import { V2HttpError } from "../services/v2HttpClient";
import { getPrompt } from "../services/v2PromptsApi";
import FlowCanvasPage from "./FlowCanvasPage";
import { useRemoteFlowAutosave, type RemoteFlowSaveStatus } from "./hooks/useRemoteFlowAutosave";
import { useRemoteFlowProject } from "./hooks/useRemoteFlowProject";
import { registerRemoteDraftSaveBarrier } from "./runtime/remoteDraftSaveBarrier";
import { useFlowCanvasStore } from "./store/flowCanvasStore";
import type { FlowNodeKind } from "./types";
import { buildAssetBackedNodeData, buildMeasuredAssetNodePatch } from "./utils/assetNodeData";
import { getImageNaturalSize } from "./utils/imageUtils";
import { buildPromptReferenceNodeData, hasPromptInsertRequest } from "./utils/promptNodeReference";
import {
  getProjectCanvasPath,
} from "./workbench/imageWorkbenchUtils";

function getProjectIdFromLocation() {
  if (typeof window === "undefined") return "";
  const match = window.location.pathname.match(/^\/projects\/([^/]+)/);
  return decodeURIComponent(match?.[1] ?? "");
}

function isExplicitProjectModePath() {
  if (typeof window === "undefined") return true;
  return /\/projects\/[^/]+\/(?:canvas|workbench)$/.test(window.location.pathname);
}

function statusLabel(status: RemoteFlowSaveStatus) {
  if (status === "syncing") return "正在保存";
  if (status === "retrying") return "正在重试同步";
  if (status === "saved") return "已保存到云端";
  if (status === "dirty" || status === "pending_sync") return "等待同步";
  if (status === "failed") return "同步异常";
  return "就绪";
}

function StatusIcon({ status }: { status: RemoteFlowSaveStatus }) {
  if (status === "syncing" || status === "retrying") return <Loader2 className="animate-spin" size={15} />;
  if (status === "dirty" || status === "pending_sync" || status === "failed") return <Cloud size={15} />;
  if (status === "saved") return <CheckCircle2 size={15} />;
  return <Cloud size={15} />;
}

function LoadingState() {
  return (
    <BrandTransition
      label="正在打开项目画布..."
      sublabel="正在恢复节点、素材与云端草稿"
      variant="canvas"
    />
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
          项目画布打开失败
        </div>
        <p className="mt-3 text-sm leading-6 text-red-100/80">{error}</p>
        <button
          className="mt-5 inline-flex h-10 items-center gap-2 rounded bg-white px-4 text-sm font-semibold text-slate-950 hover:bg-slate-200"
          onClick={onRetry}
          type="button"
        >
          <RefreshCw size={16} />
          重新加载
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
  const updateNodeData = useFlowCanvasStore((state) => state.updateNodeData);
  const viewport = useFlowCanvasStore((state) => state.viewport);
  const insertedAssetIdRef = useRef<string | null>(null);
  const insertedPromptRequestIdRef = useRef<string | null>(null);
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

  useEffect(() => registerRemoteDraftSaveBarrier(autosave.saveNow), [autosave.saveNow]);

  useEffect(() => {
    if (!projectId || isExplicitProjectModePath() || typeof window === "undefined") return;
    const nextPath = getProjectCanvasPath(projectId);
    if (window.location.pathname === nextPath) return;
    window.history.replaceState(null, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, [projectId]);

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

        const inserted = addNode(
          kindForAsset(asset.kind),
          center,
          buildAssetBackedNodeData(asset, {
            previewUrl: asset.previewUrl,
            source: "asset-library",
            title: asset.title || asset.originalFilename || "云端素材",
          }),
          { selected: true },
        );

        if (asset.previewUrl && asset.kind === "image") {
          void getImageNaturalSize(asset.previewUrl)
            .then((natural) => {
              const patch = buildMeasuredAssetNodePatch(asset, natural);
              if (!patch) return;
              updateNodeData(inserted.id, patch);
            })
            .catch(() => undefined);
        }

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
    updateNodeData,
    viewport,
  ]);

  useEffect(() => {
    if (projectState.loading || projectState.error || typeof window === "undefined") return;
    const params = new URLSearchParams(locationSearch);
    const promptId = params.get("insertPromptId");
    const requestId = params.get("promptInsertRequestId");
    if (!promptId || !requestId || insertedPromptRequestIdRef.current === requestId) return;
    if (hasPromptInsertRequest(nodes, requestId)) {
      insertedPromptRequestIdRef.current = requestId;
      removePromptInsertParameters();
      return;
    }

    insertedPromptRequestIdRef.current = requestId;
    setInsertError(null);
    void getPrompt(promptId)
      .then((prompt) => {
        const zoom = viewport.zoom || 1;
        const center = {
          x: (window.innerWidth / 2 - viewport.x) / zoom + nodes.length * 24,
          y: (window.innerHeight / 2 - viewport.y) / zoom + nodes.length * 24,
        };
        addNode(
          "image",
          center,
          buildPromptReferenceNodeData({
            promptId: prompt.id,
            promptInsertRequestId: requestId,
            promptText: prompt.promptText,
            promptTitle: prompt.title,
          }),
          { selected: true },
        );
        removePromptInsertParameters();
      })
      .catch((error) => {
        insertedPromptRequestIdRef.current = null;
        setInsertError(getPromptInsertErrorMessage(error));
      });
  }, [
    addNode,
    insertRetryTick,
    locationSearch,
    nodes,
    projectState.error,
    projectState.loading,
    viewport,
  ]);

  if (!projectId) {
    return <ErrorState error="链接中缺少项目 ID。" onRetry={() => window.location.assign("/workspace")} />;
  }

  if (projectState.loading) {
    return <LoadingState />;
  }

  if (projectState.error) {
    return <ErrorState error={projectState.error} onRetry={() => void projectState.reload()} />;
  }

  return (
    <>
      <FlowCanvasPage
        enableLocalPersistence={false}
        onServerDraftApplied={() => void projectState.reload()}
        saveStatus={{
          error: autosave.error,
          icon: <StatusIcon status={autosave.status} />,
          label: statusLabel(autosave.status),
          onRetry: autosave.saveNow,
          status: autosave.status,
        }}
      />
      {insertError && (
        <div className="fixed right-4 top-32 z-[1200] max-w-sm rounded border border-amber-300/20 bg-amber-950/90 px-4 py-3 text-sm text-amber-100 shadow-xl">
          <div>{insertError}</div>
          <button
            className="mt-3 inline-flex h-8 items-center gap-2 rounded border border-amber-200/20 px-3 text-xs font-semibold text-amber-50 hover:bg-amber-300/10"
            onClick={() => setInsertRetryTick((tick) => tick + 1)}
            type="button"
          >
            <RefreshCw size={13} />
            重试插入
          </button>
        </div>
      )}
    </>
  );
}

function removePromptInsertParameters() {
  const nextParams = new URLSearchParams(window.location.search);
  nextParams.delete("insertPromptId");
  nextParams.delete("promptInsertRequestId");
  const nextQuery = nextParams.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function getAssetInsertErrorMessage(error: unknown) {
  if (error instanceof V2HttpError) {
    if (error.status === 401) return "素材插入失败，登录状态已失效，请重新登录。";
    if (error.status === 404) return "素材插入失败，未找到所选素材。";
    if (error.status >= 500) return "素材插入失败，服务暂时无法读取该素材，请稍后重试。";
    return error.message || "素材插入失败。";
  }
  if (error instanceof Error && /failed to fetch/i.test(error.message)) {
    return "素材插入失败，当前无法连接 API。";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "素材插入失败。";
}

function getPromptInsertErrorMessage(error: unknown) {
  if (error instanceof V2HttpError && error.status === 404) return "提示词引用失败，未找到该提示词。";
  if (error instanceof V2HttpError && error.status === 401) return "提示词引用失败，登录状态已失效，请重新登录。";
  if (error instanceof Error) return error.message;
  return "提示词引用失败，请稍后重试。";
}
