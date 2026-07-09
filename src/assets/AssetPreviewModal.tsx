import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Download, Star, X } from "lucide-react";

import { MenuSelect } from "../components/menu/MenuSelect";
import { PanoramaViewer } from "../flowCanvas/panorama/PanoramaViewer";
import { isPanoramaAssetLike } from "../flowCanvas/panorama/panoramaUtils";
import { getAssetDownloadUrl, getAssetVariantUrl, updateAssetMetadata, type AssetItem } from "./assetApi";
import { listWorkspaceProjects, updateWorkspaceProject, type WorkspaceProject } from "../workspace/workspaceApi";

function kindLabel(kind: string) {
  if (kind === "image") return "图片";
  if (kind === "video") return "视频";
  if (kind === "audio") return "音频";
  if (kind === "document") return "文档";
  return kind;
}

export function AssetPreviewModal({
  asset,
  onClose,
  onUpdated,
}: {
  asset: AssetItem;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(asset.projectId ?? "");
  const [workingAction, setWorkingAction] = useState<"cover" | "favorite" | null>(null);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [favorite, setFavorite] = useState(asset.favorite);
  const [previewUrl, setPreviewUrl] = useState<string | null>(asset.previewUrl ?? null);

  useEffect(() => {
    setFavorite(asset.favorite);
  }, [asset.favorite]);

  useEffect(() => {
    setPreviewUrl(asset.previewUrl ?? null);

    if (!asset.id || (!asset.mimeType.startsWith("image/") && !asset.mimeType.startsWith("video/"))) {
      return;
    }

    let active = true;
    void getAssetVariantUrl(asset.id, "preview")
      .then((result) => {
        if (active) {
          setPreviewUrl(result.url);
        }
      })
      .catch(() => {
        if (active) {
          setPreviewUrl(asset.previewUrl ?? null);
        }
      });

    return () => {
      active = false;
    };
  }, [asset.id, asset.mimeType, asset.previewUrl]);

  useEffect(() => {
    setLoadingProjects(true);
    setProjectsError(null);
    void listWorkspaceProjects()
      .then((items) => {
        setProjects(items);
        setSelectedProjectId((current) => current || items[0]?.id || "");
      })
      .catch((error) => {
        setProjects([]);
        setProjectsError(error instanceof Error ? error.message : "项目加载失败，请稍后重试。");
      })
      .finally(() => setLoadingProjects(false));
  }, [asset.projectId]);

  const title = asset.title || asset.originalFilename || "未命名素材";

  const displayUrl = previewUrl || asset.previewUrl || "";
  const isPanoramaAsset = isPanoramaAssetLike(asset);

  const download = async () => {
    setActionError(null);
    try {
      const url = await getAssetDownloadUrl(asset.id);
      window.open(url.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "暂时无法下载该素材。");
    }
  };

  const toggleFavorite = async () => {
    setActionError(null);
    setActionMessage(null);
    setWorkingAction("favorite");
    try {
      const nextFavorite = !favorite;
      await updateAssetMetadata(asset.id, { favorite: nextFavorite });
      setFavorite(nextFavorite);
      setActionMessage(nextFavorite ? "已加入收藏。" : "已取消收藏。");
      onUpdated();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "更新收藏状态失败，请稍后重试。");
    } finally {
      setWorkingAction(null);
    }
  };

  const setCover = async () => {
    if (!selectedProjectId) return;
    setActionError(null);
    setActionMessage(null);
    setWorkingAction("cover");
    try {
      await updateWorkspaceProject(selectedProjectId, { coverAssetId: asset.id });
      setActionMessage("项目封面已更新，返回工作区后即可看到最新卡片封面。");
      onUpdated();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "设置项目封面失败，请稍后重试。");
    } finally {
      setWorkingAction(null);
    }
  };

  const insertIntoCanvas = () => {
    if (!selectedProjectId) return;
    window.history.pushState(null, "", `/projects/${selectedProjectId}?insertAssetId=${encodeURIComponent(asset.id)}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    onClose();
  };

  const modal = (
    <div
      className="fixed inset-0 z-[2600] flex items-center justify-center p-4"
      data-testid="asset-preview-overlay"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/35 backdrop-blur-md" data-testid="asset-preview-backdrop" />
      <section
        aria-modal="true"
        className="relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/95 shadow-[0_24px_80px_rgba(0,0,0,0.55)] ring-1 ring-white/10 backdrop-blur-xl md:flex-row"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button
          aria-label="关闭预览"
          className="absolute right-3 top-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/65 text-slate-300 hover:bg-black hover:text-white"
          onClick={onClose}
          title="关闭"
          type="button"
        >
          <X size={18} />
        </button>
        <div className="relative flex h-64 min-h-[16rem] w-full flex-shrink-0 items-center justify-center bg-black/45 md:h-auto md:w-1/2" data-testid="asset-preview-stage">
          {displayUrl && isPanoramaAsset ? (
            <PanoramaViewer className="h-full w-full" imageUrl={displayUrl} label={title} />
          ) : displayUrl && asset.mimeType.startsWith("image/") ? (
            <img alt="" className="max-h-[calc(100%-2rem)] max-w-[calc(100%-2rem)] object-contain" src={displayUrl} />
          ) : displayUrl && asset.mimeType.startsWith("video/") ? (
            <video className="max-h-[calc(100%-2rem)] max-w-[calc(100%-2rem)]" controls preload="metadata" src={displayUrl} />
          ) : (
            <div className="px-8 text-center text-sm text-slate-500">该素材类型暂不支持预览。</div>
          )}
        </div>
        <div className="flex min-h-0 w-full flex-col overflow-y-auto overscroll-contain p-5 md:w-1/2">
          <div className="pr-12">
            <div className="text-xs uppercase tracking-[0.18em] text-sky-300">{kindLabel(asset.kind)}</div>
            <h2 className="mt-2 break-words text-xl font-semibold text-white">{title}</h2>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
            <Info label="MIME" value={asset.mimeType} />
            <Info label="状态" value={asset.status} />
            <Info label="大小" value={asset.sizeBytes ? `${Math.round(asset.sizeBytes / 1024)} KB` : "-"} />
            <Info label="尺寸" value={asset.width && asset.height ? `${asset.width} x ${asset.height}` : "-"} />
          </dl>
          <div className="mt-5 text-xs font-medium text-slate-400">项目</div>
          <div className="mt-2">
            <MenuSelect
              label="asset project"
              disabled={loadingProjects}
              onChange={setSelectedProjectId}
              options={[
                { label: "选择项目", value: "" },
                ...projects.map((project) => ({ label: project.name, value: project.id })),
              ]}
              size="compact"
              value={selectedProjectId}
              fullWidth
            />
          </div>
          {loadingProjects && <div className="mt-2 text-xs text-slate-500">正在加载项目...</div>}
          {projectsError && <div className="mt-2 text-xs text-red-300">{projectsError}</div>}
          {actionError && <div className="mt-3 text-xs text-red-300">{actionError}</div>}
          {actionMessage && <div className="mt-3 text-xs text-emerald-300">{actionMessage}</div>}
          <div className="mt-auto grid gap-2 pt-5">
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded bg-sky-300 px-4 text-sm font-semibold text-slate-950 hover:bg-sky-200 disabled:opacity-50"
              disabled={!selectedProjectId || loadingProjects}
              onClick={insertIntoCanvas}
              type="button"
            >
              <ArrowRight size={16} />
              插入画布
            </button>
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded border border-white/10 px-4 text-sm font-semibold text-slate-100 hover:bg-white/[0.06] disabled:opacity-50"
              disabled={!selectedProjectId || loadingProjects || workingAction !== null}
              onClick={() => void setCover()}
              type="button"
            >
              {workingAction === "cover" ? "设置中..." : "设为项目封面"}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded border border-white/10 px-4 text-sm font-semibold text-slate-100 hover:bg-white/[0.06] disabled:opacity-50"
                disabled={workingAction !== null}
                onClick={() => void toggleFavorite()}
                type="button"
              >
                <Star fill={favorite ? "currentColor" : "none"} size={16} />
                {workingAction === "favorite" ? "保存中..." : "收藏"}
              </button>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded border border-white/10 px-4 text-sm font-semibold text-slate-100 hover:bg-white/[0.06]"
                onClick={() => void download()}
                type="button"
              >
                <Download size={16} />
                下载
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.035] p-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 truncate text-slate-200">{value}</dd>
    </div>
  );
}
