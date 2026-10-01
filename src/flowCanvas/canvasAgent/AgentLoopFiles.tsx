import { ArrowLeft, FileJson, FileText, Loader2, MessageSquarePlus, X } from "lucide-react";
import { useEffect, useState } from "react";

import { AgentLoopMarkdown } from "./AgentLoopMarkdown";
import { canvasAgentApi } from "./canvasAgentApi";
import type { CanvasAgentFile, CanvasAgentFileSummary } from "./canvasAgentTypes";

const fileIcon = (path: string) => (path.endsWith(".json") ? <FileJson aria-hidden size={14} /> : <FileText aria-hidden size={14} />);

function prettyJson(content: string): string {
  try { return JSON.stringify(JSON.parse(content), null, 2); } catch { return content; }
}

/** Project files the agent maintains for this canvas (project.md, req_*.json). */
export function AgentLoopFiles({ files, flowId, onClose, onDiscuss }: {
  files: CanvasAgentFileSummary[];
  flowId: string;
  onClose: () => void;
  onDiscuss: (path: string) => void;
}) {
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [file, setFile] = useState<CanvasAgentFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!openPath) { setFile(null); return; }
    let alive = true;
    setFile(null);
    setError(null);
    canvasAgentApi.readFile(flowId, openPath)
      .then((result) => { if (alive) setFile(result); })
      .catch(() => { if (alive) setError("文件读取失败"); });
    return () => { alive = false; };
  }, [flowId, openPath]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside aria-label="项目文件" className="agent-loop-files">
      <header className="agent-loop-files-head">
        {openPath ? <button aria-label="返回文件列表" className="agent-loop-icon" type="button" onClick={() => setOpenPath(null)}><ArrowLeft size={15} /></button> : null}
        <strong>{openPath ?? "文件"}</strong>
        <button aria-label="关闭文件" className="agent-loop-icon" type="button" onClick={onClose}><X size={15} /></button>
      </header>
      {!openPath ? (
        files.length === 0 ? <p className="agent-loop-files-empty">Agent 还没有写项目文件。</p> : (
          <ul className="agent-loop-files-list">
            {files.map((entry) => (
              <li key={entry.path}>
                <button className="agent-loop-files-item" type="button" onClick={() => setOpenPath(entry.path)}>
                  {fileIcon(entry.path)}
                  <span>{entry.path}</span>
                  <span className="agent-loop-files-meta">v{entry.version}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="agent-loop-files-body">
          {error ? <p role="alert">{error}</p> : !file ? <Loader2 aria-label="加载中" className="agent-loop-spin" size={16} /> : file.path.endsWith(".md")
            ? <AgentLoopMarkdown text={file.content} />
            : <pre className="agent-loop-files-pre">{file.path.endsWith(".json") ? prettyJson(file.content) : file.content}</pre>}
        </div>
      )}
      {openPath && file ? (
        <footer className="agent-loop-files-actions">
          <button className="agent-loop-button" type="button" onClick={() => { onDiscuss(file.path); onClose(); }}>
            <MessageSquarePlus aria-hidden size={14} />在对话中讨论
          </button>
        </footer>
      ) : null}
    </aside>
  );
}
