import React, { useState } from "react";
import { Send, X } from "lucide-react";
import type { CanvasAgentV3RuntimeIdentity, CanvasAgentV3Task } from "./canvasAgentV3Types";

export function CanvasAgentCommandBar({ task, runtimeIdentity, onSubmit, onCancel }: { task?: CanvasAgentV3Task; runtimeIdentity: CanvasAgentV3RuntimeIdentity; onSubmit: (prompt: string) => void; onCancel?: () => void }) {
  const [prompt, setPrompt] = useState("");
  const active = Boolean(task && !["succeeded", "failed", "cancelled", "partial_success"].includes(task.status));
  return <form className="canvas-agent-v3-command-bar" onSubmit={(event) => { event.preventDefault(); if (prompt.trim() && !active) { onSubmit(prompt.trim()); setPrompt(""); } }}>
    <span className="canvas-agent-v3-runtime" data-runtime={runtimeIdentity}>{runtimeIdentity}</span>
    <input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="描述你想在画布上完成的事" disabled={active} aria-label="Canvas Agent prompt" />
    {active ? <button type="button" onClick={onCancel} aria-label="Cancel task"><X size={16} /></button> : <button type="submit" disabled={!prompt.trim()} aria-label="Send prompt"><Send size={16} /></button>}
  </form>;
}
