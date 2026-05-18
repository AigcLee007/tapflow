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
  const [working, setWorking] = useState(false);

  useEffect(() => {
    void listWorkspaceProjects()
      .then((items) => {
        setProjects(items);
        if (!selectedProjectId && items[0]) setSelectedProjectId(items[0].id);
      })
      .catch(() => setProjects([]));
  }, [selectedProjectId]);

  const title = asset.title || asset.originalFilename || "Untitled asset";

  const download = async () => {
    const url = await getAssetDownloadUrl(asset.id);
    window.open(url.url, "_blank", "noopener,noreferrer");
  };

  const toggleFavorite = async () => {
    setWorking(true);
    try {
      await updateAssetMetadata(asset.id, { favorite: !asset.favorite });
      onUpdated();
    } finally {
      setWorking(false);
    }
  };

  const setCover = async () => {
    if (!selectedProjectId) return;
    setWorking(true);
    try {
      await updateWorkspaceProject(selectedProjectId, { coverAssetId: asset.id });
      onUpdated();
    } finally {
      setWorking(false);
    }
  };

  const insertIntoCanvas = () => {
    if (!selectedProjectId) return;
    window.history.pushState(null, "", `/projects/${selectedProjectId}?insertAssetId=${asset.id}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <div className="fixed inset-0 z-[1500] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <section className="grid max-h-[92vh] w-full max-w-5xl overflow-hidden rounded border border-white/10 bg-zinc-950 shadow-2xl md:grid-cols-[minmax(0,1.4fr)_360px]">
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
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-sky-300">{asset.kind}</div>
              <h2 className="mt-2 break-words text-xl font-semibold text-white">{title}</h2>
            </div>
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded text-slate-400 hover:bg-white/10 hover:text-white"
              onClick={onClose}
              title="Close"
              type="button"
            >
              <X size={18} />
            </button>
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
          <div className="mt-auto grid gap-2 pt-5">
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded bg-sky-300 px-4 text-sm font-semibold text-slate-950 hover:bg-sky-200 disabled:opacity-50"
              disabled={!selectedProjectId}
              onClick={insertIntoCanvas}
              type="button"
            >
              <ArrowRight size={16} />
              Insert into canvas
            </button>
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded border border-white/10 px-4 text-sm font-semibold text-slate-100 hover:bg-white/[0.06] disabled:opacity-50"
              disabled={!selectedProjectId || working}
              onClick={() => void setCover()}
              type="button"
            >
              Set as project cover
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded border border-white/10 px-4 text-sm font-semibold text-slate-100 hover:bg-white/[0.06] disabled:opacity-50"
                disabled={working}
                onClick={() => void toggleFavorite()}
                type="button"
              >
                <Star fill={asset.favorite ? "currentColor" : "none"} size={16} />
                Favorite
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
