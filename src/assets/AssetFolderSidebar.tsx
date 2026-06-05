import React, { useState } from "react";
import { Folder, FolderPlus, Images } from "lucide-react";

import { createAssetFolder, type AssetFolder } from "./assetApi";

export function AssetFolderSidebar({
  folders,
  onCreated,
  onSelect,
  selectedFolderId,
}: {
  folders: AssetFolder[];
  onCreated: () => void;
  onSelect: (folderId: string | null) => void;
  selectedFolderId: string | null;
}) {
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const createFolder = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      await createAssetFolder({ name: trimmed });
      setName("");
      onCreated();
    } finally {
      setCreating(false);
    }
  };

  return (
    <aside className="w-full border-b border-white/10 bg-black/20 p-4 md:min-h-[calc(100vh-92px)] md:w-64 md:border-b-0 md:border-r">
      <button
        className={`flex h-10 w-full items-center gap-2 rounded px-3 text-left text-sm ${
          selectedFolderId === null ? "bg-sky-400/15 text-sky-100" : "text-slate-300 hover:bg-white/[0.05]"
        }`}
        onClick={() => onSelect(null)}
        type="button"
      >
        <Images size={16} />
        全部素材
      </button>
      <div className="mt-4 space-y-1">
        {folders.map((folder) => (
          <button
            className={`flex h-9 w-full items-center gap-2 rounded px-3 text-left text-sm ${
              selectedFolderId === folder.id ? "bg-sky-400/15 text-sky-100" : "text-slate-300 hover:bg-white/[0.05]"
            }`}
            key={folder.id}
            onClick={() => onSelect(folder.id)}
            type="button"
          >
            <Folder size={15} />
            <span className="truncate">{folder.name}</span>
          </button>
        ))}
      </div>
      <div className="mt-5 flex gap-2">
        <input
          className="min-w-0 flex-1 rounded border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-400/60"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void createFolder();
          }}
          placeholder="新建文件夹"
          value={name}
        />
        <button
          className="inline-flex h-10 w-10 items-center justify-center rounded bg-white text-slate-950 hover:bg-slate-200 disabled:opacity-50"
          disabled={creating || !name.trim()}
          onClick={() => void createFolder()}
          title="创建文件夹"
          type="button"
        >
          <FolderPlus size={17} />
        </button>
      </div>
    </aside>
  );
}
