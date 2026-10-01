import { ChevronDown, ChevronRight, Image as ImageIcon, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import { MenuSelect } from "../../components/menu/MenuSelect";
import type { TranscriptItem } from "./canvasAgentTranscript";
import type { CanvasAgentApprovalPayload, CanvasAgentImageModel } from "./canvasAgentTypes";

type GenerationItem = Extract<TranscriptItem, { kind: "generation" }>;
type Size = "1K" | "2K" | "4K";

const STATE_NOTE: Record<Exclude<GenerationItem["state"], "approval">, string> = {
  cancelled: "已取消这批生成",
  done: "",
  generating: "正在画布上生成…",
  rejected: "你取消了这批生成",
  skipped: "已跳过",
};

function estimate(models: CanvasAgentImageModel[], modelKey: string, routeKey: string | null, size: Size, count: number, tasks: number): number | null {
  const model = models.find((entry) => entry.modelKey === modelKey);
  const route = model?.routes.find((entry) => entry.routeKey === routeKey) ?? model?.routes.find((entry) => entry.routeKey === model.defaultRouteKey) ?? model?.routes[0];
  const credits = route?.sizes.find((entry) => entry.size === size)?.credits;
  return credits === undefined ? null : credits * count * tasks;
}

export function AgentLoopGenerationCard({ disabled, item, models, onDecide, waitingForExecutor }: {
  disabled?: boolean;
  item: GenerationItem;
  models: CanvasAgentImageModel[];
  onDecide: (payload: CanvasAgentApprovalPayload) => void;
  /** True while state is "generating" but no canvas executor is wired yet (phase 3). */
  waitingForExecutor?: boolean;
}) {
  const first = item.plan.tasks[0];
  const [modelKey, setModelKey] = useState(item.plan.modelKey);
  const [aspectRatio, setAspectRatio] = useState(first?.aspectRatio ?? "1:1");
  const [size, setSize] = useState<Size>(first?.size ?? "2K");
  const [count, setCount] = useState(first?.count ?? 1);
  const [kept, setKept] = useState<number[]>(() => item.plan.tasks.map((_task, index) => index));
  const [expanded, setExpanded] = useState<number | null>(null);

  const model = models.find((entry) => entry.modelKey === modelKey);
  const editable = item.state === "approval" && !disabled;
  const credits = useMemo(() => {
    const live = estimate(models, modelKey, modelKey === item.plan.modelKey ? item.plan.routeKey : null, size, count, kept.length);
    return live ?? (kept.length === item.plan.tasks.length ? item.plan.estimatedCredits : null);
  }, [count, item.plan, kept.length, modelKey, models, size]);

  const confirm = () => {
    const overrides: NonNullable<CanvasAgentApprovalPayload["overrides"]> = {};
    if (modelKey !== item.plan.modelKey) overrides.modelKey = modelKey;
    if (aspectRatio !== first?.aspectRatio) overrides.aspectRatio = aspectRatio;
    if (size !== first?.size) overrides.size = size;
    if (count !== first?.count) overrides.count = count;
    onDecide({
      approved: true,
      ...(Object.keys(overrides).length ? { overrides } : {}),
      ...(kept.length !== item.plan.tasks.length ? { taskIndexes: kept } : {}),
    });
  };

  const option = (value: string) => ({ label: value, value });
  const ratios = model?.aspectRatios.length ? model.aspectRatios : [aspectRatio];
  const sizes = model?.sizes.length ? model.sizes : [size];
  const counts = model?.quantityOptions.length ? model.quantityOptions : [count];
  const modelOptions = models.length ? models.map((entry) => ({ label: entry.displayName, value: entry.modelKey })) : [option(modelKey)];

  return (
    <section aria-label="图片生成确认" className={`agent-loop-card agent-loop-generation is-${item.state}`}>
      <header className="agent-loop-generation-head">
        <ImageIcon aria-hidden size={14} />
        <span>图片生成</span>
        {credits !== null ? <span className="agent-loop-credits">~{credits} 积分</span> : null}
      </header>
      <ol className="agent-loop-tasks">
        {item.plan.tasks.map((task, index) => {
          if (item.state === "approval" && !kept.includes(index)) return null;
          const result = item.results?.find((entry) => entry.taskIndex === index);
          const open = expanded === index;
          return (
            <li className="agent-loop-task" key={`${task.title}-${index}`}>
              <button aria-expanded={open} className="agent-loop-task-main" type="button" onClick={() => setExpanded(open ? null : index)}>
                <span className="agent-loop-task-index">{index + 1}.</span>
                <span className="agent-loop-task-title">{task.title}</span>
                {open ? <ChevronDown aria-hidden size={13} /> : <ChevronRight aria-hidden size={13} />}
              </button>
              {result ? <span className={`agent-loop-task-result is-${result.status}`}>{result.status === "succeeded" ? "已生成" : result.status === "failed" ? "失败" : "已取消"}</span> : null}
              {editable ? (
                <button aria-label={`移除 ${task.title}`} className="agent-loop-link" disabled={kept.length <= 1} type="button" onClick={() => setKept(kept.filter((value) => value !== index))}>移除</button>
              ) : null}
              {open ? <p className="agent-loop-task-prompt">{task.prompt}</p> : null}
            </li>
          );
        })}
      </ol>
      <div className="agent-loop-generation-params">
        <span className="agent-loop-param">{item.state === "approval" ? kept.length : item.plan.tasks.length} 个任务</span>
        {editable ? (
          <>
            <MenuSelect label="生图模型" options={modelOptions} size="compact" value={modelKey} onChange={setModelKey} />
            <MenuSelect label="画面比例" options={ratios.map(option)} size="compact" value={aspectRatio} onChange={setAspectRatio} />
            <MenuSelect label="分辨率" options={sizes.map(option)} size="compact" value={size} onChange={(value) => setSize(value as Size)} />
            <MenuSelect label="每个任务张数" options={counts.map((value) => ({ label: `${value}×`, value: String(value) }))} size="compact" value={String(count)} onChange={(value) => setCount(Number(value))} />
          </>
        ) : (
          <span className="agent-loop-param">{model?.displayName ?? item.plan.modelKey} · {first?.aspectRatio} · {first?.size} · {first?.count}×</span>
        )}
      </div>
      {item.state === "approval" ? (
        <footer className="agent-loop-card-actions">
          <button className="agent-loop-button" disabled={disabled} type="button" onClick={() => onDecide({ approved: false })}>取消</button>
          <button className="agent-loop-button is-primary" disabled={disabled} type="button" onClick={confirm}>确认</button>
        </footer>
      ) : item.state === "done" ? null : (
        <p className="agent-loop-card-note">
          {item.state === "generating" ? <Loader2 aria-hidden className="agent-loop-spin" size={13} /> : null}
          {item.state === "generating" && waitingForExecutor ? "已确认，等待画布执行（画布生成将在下一阶段接入）" : STATE_NOTE[item.state]}
        </p>
      )}
    </section>
  );
}
