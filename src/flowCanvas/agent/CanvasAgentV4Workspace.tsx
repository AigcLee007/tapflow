import React from "react";
import { Check, ChevronRight, CircleHelp, Layers3, Sparkles, WandSparkles } from "lucide-react";

type Phase = "idle" | "asking" | "brief" | "executing";

const directionOptions = [
  { id: "comfort", label: "陪伴与情绪安抚", detail: "让孩子愿意亲近、表达和获得安定感。", icon: "💛" },
  { id: "learning", label: "互动学习与启蒙", detail: "把认知、语言或习惯养成融进互动。", icon: "🌱" },
  { id: "story", label: "故事与角色扮演", detail: "围绕角色设定，形成可持续的玩耍内容。", icon: "✨" },
] as const;

const ageOptions = ["0-3 岁", "3-6 岁", "6-9 岁"] as const;

export function CanvasAgentV4Workspace(props: {
  children?: React.ReactNode;
  initialPrompt?: string;
  onExecute: (brief: string) => void;
}) {
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [prompt, setPrompt] = React.useState(props.initialPrompt ?? "");
  const [direction, setDirection] = React.useState<string | null>(null);
  const [age, setAge] = React.useState<string | null>(null);

  const selectedDirection = directionOptions.find((item) => item.id === direction);
  const brief = `基于用户提供的参考形象，设计一款${age ?? "适龄"}儿童陪伴玩具，核心方向为“${selectedDirection?.label ?? "陪伴体验"}”。保留角色识别度，补充材质、交互方式、安全边界和可落地的产品细节。`;

  const start = () => {
    if (!prompt.trim()) return;
    setPhase("asking");
  };

  return (
    <div className="agent-v4-workspace" data-testid="agent-v4-workspace">
      <div className="agent-v4-intro">
        <div className="agent-v4-eyebrow"><Sparkles size={14} /> 共创工作台</div>
        <h1>{phase === "idle" ? "先说说你想做什么" : phase === "asking" ? "先把方向定清楚" : phase === "brief" ? "这是我理解的方案" : "正在把方案变成画布成果"}</h1>
        <p>{phase === "idle" ? "我会先理解你的目标、参考图和使用场景，再和你一起确定方案。" : phase === "asking" ? "我不会直接替你生成，先确认两个会影响结果的关键选择。" : phase === "brief" ? "确认后我才会调用生成能力，并把结果整理成可继续编辑的一组方案。" : "你可以继续补充要求，生成完成后还能选择、比较和继续编辑。"}</p>
      </div>

      {phase === "idle" ? (
        <section className="agent-v4-start-card">
          <div className="agent-v4-field-label"><CircleHelp size={14} /> 你的任务</div>
          <textarea aria-label="Agent 任务" onChange={(event) => setPrompt(event.target.value)} placeholder="例如：根据这张小黄人图片，设计一款儿童陪伴玩具" value={prompt} />
          <div className="agent-v4-context-row"><span><Layers3 size={14} /> 已识别画布参考图</span><span className="agent-v4-context-badge">1 个参考</span></div>
          <button className="agent-v4-primary" disabled={!prompt.trim()} onClick={start} type="button"><WandSparkles size={16} /> 开始共创 <ChevronRight size={16} /></button>
        </section>
      ) : null}

      {phase === "asking" ? (
        <div className="agent-v4-dialog-stack">
          <div className="agent-v4-user-bubble">{prompt}</div>
          <section className="agent-v4-question-card">
            <div className="agent-v4-card-kicker">问题 1 / 2</div>
            <h2>你更想优先解决哪件事？</h2>
            <p>这会决定玩具的角色设定、交互方式和后续外观方向。</p>
            <div className="agent-v4-choice-grid">
              {directionOptions.map((item) => (
                <button aria-label={item.label} key={item.id} className={direction === item.id ? "agent-v4-choice active" : "agent-v4-choice"} onClick={() => setDirection(item.id)} type="button">
                  <span className="agent-v4-choice-icon">{item.icon}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span>{direction === item.id ? <Check size={16} /> : null}
                </button>
              ))}
            </div>
            {direction ? (
              <div className="agent-v4-followup">
                <div className="agent-v4-card-kicker">问题 2 / 2</div><h2>主要陪伴哪个年龄段？</h2>
                <div className="agent-v4-pill-row">{ageOptions.map((item) => <button key={item} className={age === item ? "agent-v4-pill active" : "agent-v4-pill"} onClick={() => { setAge(item); setPhase("brief"); }} type="button">{item}</button>)}</div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {phase === "brief" ? (
        <div className="agent-v4-dialog-stack">
          <section className="agent-v4-brief-card">
            <div className="agent-v4-card-kicker">Agent 理解 · 已确认 2 项偏好</div><h2>共创 Brief</h2>
            <div className="agent-v4-brief-row"><span>目标</span><strong>{selectedDirection?.label}</strong></div>
            <div className="agent-v4-brief-row"><span>使用人群</span><strong>{age}</strong></div>
            <div className="agent-v4-brief-row"><span>参考策略</span><strong>保留角色识别度，探索 3 个产品化方向</strong></div>
            <div className="agent-v4-skill-card"><span className="agent-v4-skill-icon">✦</span><span><strong>儿童产品概念设计</strong><small>将启用：角色设定 · 外观草案 · 交互场景 · 安全检查</small></span></div>
            <div className="agent-v4-confirm-row"><span>预计生成 3 个方向 · 约 12 积分</span><button className="agent-v4-primary" onClick={() => { setPhase("executing"); props.onExecute(brief); }} type="button">确认并开始设计 <ChevronRight size={16} /></button></div>
          </section>
        </div>
      ) : null}

      {phase === "executing" ? <div className="agent-v4-executing"><span className="agent-v4-spinner" /><strong>正在执行儿童产品概念设计</strong><small>先生成方向草案，再整理成可比较的结果组</small></div> : null}
      {phase === "executing" ? props.children : null}
    </div>
  );
}
