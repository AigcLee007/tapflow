import React, { useEffect, useState } from "react";
import { ArrowRight, Download, Star, X } from "lucide-react";

import { getAssetDownloadUrl, updateAssetMetadata, type AssetItem } from "./assetApi";
import { listWorkspaceProjects, updateWorkspaceProject, type WorkspaceProject } from "../workspace/workspaceApi";

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

  useEffect(() => {
    setFavorite(asset.favorite);
  }, [asset.favorite]);

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
        setProjectsError(error instanceof Error ? error.message : "Unable to load projects.");
      })
      .finally(() => setLoadingProjects(false));
  }, [asset.projectId]);

  const title = asset.title || asset.originalFilename || "Untitled asset";

  const download = async () => {
    setActionError(null);
    try {
      const url = await getAssetDownloadUrl(asset.id);
      window.open(url.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to open download.");
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
      setActionMessage(nextFavorite ? "Added to favorites." : "Removed from favorites.");
      onUpdated();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to update favorite.");
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
      setActionMessage("Project cover updated. Refresh /workspace to confirm the latest card image.");
      onUpdated();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to set project cover.");
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

  return (
    <div className="fixed inset-0 z-[1500] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <section className="relative grid max-h-[92vh] w-full max-w-5xl overflow-hidden rounded border border-white/10 bg-zinc-950 shadow-2xl md:grid-cols-[minmax(0,1.4fr)_360px]">
        <button
          aria-label="Close preview"
          className="absolute right-3 top-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/65 text-slate-300 hover:bg-black hover:text-white"
          onClick={onClose}
          title="Close"
          type="button"
        >
          <X size={18} />
        </button>
        <div className="grid min-h-[360px] place-items-center bg-black">
          {asset.previewUrl && asset.mimeType.startsWith("image/") ? (
            <img alt="" className="max-h-[82vh] max-w-full object-contain" src={asset.previewUrl} />
          ) : asset.previewUrl && asset.mimeType.startsWith("video/") ? (
            <video className="max-h-[82vh] max-w-full" controls src={asset.previewUrl} />
          ) : (
            <div className="px-8 text-center text-sm text-slate-500">Preview is not available for this asset type.</div>
          )}
        </div>
        <div className="flex min-h-0 flex-col p-5">
          <div className="pr-12">
            <div className="text-xs uppercase tracking-[0.18em] text-sky-300">{asset.kind}</div>
            <h2 className="mt-2 break-words text-xl font-semibold text-white">{title}</h2>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
            <Info label="MIME" value={asset.mimeType} />
            <Info label="Status" value={asset.status} />
            <Info label="Size" value={asset.sizeBytes ? `${Math.round(asset.sizeBytes / 1024)} KB` : "-"} />
            <Info label="Dimensions" value={asset.width && asset.height ? `${asset.width} x ${asset.height}` : "-"} />
          </dl>
          <label className="mt-5 text-xs font-medium text-slate-400" htmlFor="asset-project">
            Project
          </label>
          <select
            className="mt-2 h-10 rounded border border-white/10 bg-black/30 px-3 text-sm text-slate-100 outline-none focus:border-sky-400/60"
            id="asset-project"
            onChange={(event) => setSelectedProjectId(event.target.value)}
            value={selectedProjectId}
          >
            <option value="">Select project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          {loadingProjects && <div className="mt-2 text-xs text-slate-500">Loading projects...</div>}
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
              Insert into canvas
            </button>
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded border border-white/10 px-4 text-sm font-semibold text-slate-100 hover:bg-white/[0.06] disabled:opacity-50"
              disabled={!selectedProjectId || loadingProjects || workingAction !== null}
              onClick={() => void setCover()}
              type="button"
            >
              {workingAction === "cover" ? "Setting cover..." : "Set as project cover"}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded border border-white/10 px-4 text-sm font-semibold text-slate-100 hover:bg-white/[0.06] disabled:opacity-50"
                disabled={workingAction !== null}
                onClick={() => void toggleFavorite()}
                type="button"
              >
                <Star fill={favorite ? "currentColor" : "none"} size={16} />
                {workingAction === "favorite" ? "Saving..." : "Favorite"}
              </button>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded border border-white/10 px-4 text-sm font-semibold text-slate-100 hover:bg-white/[0.06]"
                onClick={() => void download()}
                type="button"
              >
                <Download size={16} />
                Download
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.035] p-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 truncate text-slate-200">{value}</dd>
    </div>
  );
}
