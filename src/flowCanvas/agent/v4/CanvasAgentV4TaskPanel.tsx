import type { CanvasAgentV4Task } from "./canvasAgentV4Types";
import { useState } from "react";

function latest<T>(task: CanvasAgentV4Task, key: string): T | undefined {
  for (let index = task.events.length - 1; index >= 0; index -= 1) {
    const value = task.events[index][key];
    if (value !== undefined) return value as T;
  }
  return undefined;
}

export function CanvasAgentV4TaskPanel({ task, onSubmit, onApprove, onCancel, onRetry, onUndo }: { task?: CanvasAgentV4Task; onSubmit?: (prompt: string) => void; onApprove?: () => void; onCancel?: () => void; onRetry?: (itemId: string) => void; onUndo?: (revision: number) => void }) {
  const [prompt, setPrompt] = useState("");
  if (!task) return <aside aria-label="Canvas Agent V4 task panel"><h2>Canvas Agent V4</h2><form onSubmit={(event) => { event.preventDefault(); if (prompt.trim()) { onSubmit?.(prompt.trim()); setPrompt(""); } }}><input aria-label="V4 prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="描述要生成的商品套图" /><button type="submit">发送</button></form></aside>;
  const failed = task.generationItems?.filter((item) => item.status === "failed") ?? [];
  const succeeded = task.generationItems?.filter((item) => item.status === "succeeded") ?? [];
  const appliedRevision = task.events.reduce<number | undefined>((revision, event) => typeof event.revision === "number" ? event.revision : revision, undefined);
  const suitePlan = latest<{ mainImageCount: number; detailPageCount: number; pages: Array<{ pageKey: string; purpose: string; dependsOn: string[] }> }>(task, "suitePlan");
  const visualBible = latest<{ productLock: string; palette: string[]; lighting: string; background: string; typography: string; composition: string; prohibitions: string[] }>(task, "visualBible");
  const promptSet = latest<Array<{ itemId: string; prompt: string; referenceAssetIds?: string[] }>>(task, "promptSet") ?? latest<Array<{ itemId: string; prompt: string; referenceAssetIds?: string[] }>>(task, "items");
  const dependencyGraph = latest<Array<{ from: string; to: string }>>(task, "dependencyGraph");
  return <aside aria-label="Canvas Agent V4 task panel"><h2>Canvas Agent V4</h2><p>状态：{task.status}</p><p>事件：{task.events.length}</p><form onSubmit={(event) => { event.preventDefault(); if (prompt.trim()) { onSubmit?.(prompt.trim()); setPrompt(""); } }}><input aria-label="V4 prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="继续描述或修复某一页" /><button type="submit">发送</button></form>{task.status === "waiting_for_approval" && <button type="button" onClick={onApprove}>批准执行</button>}{!['succeeded', 'failed', 'cancelled'].includes(task.status) && <button type="button" onClick={onCancel}>取消任务</button>}
    {suitePlan && <section aria-label="套图计划"><h3>套图计划</h3><p>主图 {suitePlan.mainImageCount} · 详情页 {suitePlan.detailPageCount}</p><ol>{suitePlan.pages.map((page) => <li key={page.pageKey}>{page.pageKey}：{page.purpose}</li>)}</ol></section>}
    {visualBible && <section aria-label="Visual Bible"><h3>视觉规范</h3><p>{visualBible.productLock}</p><p>{visualBible.composition}；{visualBible.lighting}</p><p>{visualBible.background}；字体：{visualBible.typography}</p><p>禁用：{visualBible.prohibitions.join("；")}</p></section>}
    {promptSet && <section aria-label="Prompt Set"><h3>页面提示词 ({promptSet.length})</h3>{promptSet.map((item) => <details key={item.itemId}><summary>{item.itemId}{item.referenceAssetIds?.length ? ` · 参考素材 ${item.referenceAssetIds.length}` : ""}</summary><p>{item.prompt}</p></details>)}</section>}
    {dependencyGraph && <section aria-label="依赖图"><h3>生成依赖</h3>{dependencyGraph.map((edge, index) => <div key={`${edge.from}-${edge.to}-${index}`}>{edge.from} → {edge.to}</div>)}</section>}
    {succeeded.length > 0 && <section aria-label="已生成结果"><h3>已生成 {succeeded.length} 项</h3>{succeeded.map((item) => <div key={item.itemId}>{item.itemId}{item.assetId ? ` · ${item.assetId}` : ""}</div>)}</section>}{failed.map((item) => <button key={item.itemId} type="button" onClick={() => onRetry?.(item.itemId)}>重试 {item.itemId}</button>)}{appliedRevision !== undefined && onUndo && <button type="button" onClick={() => onUndo(appliedRevision)}>撤销交付</button>}</aside>;
}
