import type {
  CanvasAgentEvent,
  CanvasAgentGenerationPlan,
  CanvasAgentGenerationResult,
  CanvasAgentPending,
  CanvasAgentQuestion,
  CanvasAgentQuestionAnswer,
  CanvasAgentSession,
  CanvasAgentStoredMessage,
} from "./canvasAgentTypes";

export type AgentStep = {
  callId: string;
  durationMs?: number;
  name: string;
  status: "failed" | "ok" | "running" | "stopped";
  summary?: string;
  title: string;
};

export type QuestionsCardState = "answered" | "cancelled" | "open" | "skipped";
export type GenerationCardState = "approval" | "cancelled" | "done" | "generating" | "rejected" | "skipped";

export type TranscriptItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; streaming: boolean; text: string }
  | { id: string; kind: "steps"; steps: AgentStep[] }
  | { answers?: CanvasAgentQuestionAnswer[]; callId: string; id: string; kind: "questions"; questions: CanvasAgentQuestion[]; state: QuestionsCardState }
  | { callId: string; id: string; kind: "generation"; plan: CanvasAgentGenerationPlan; results?: CanvasAgentGenerationResult[]; state: GenerationCardState }
  | { id: string; kind: "error"; message: string };

/** Tools rendered as cards rather than as rows in the step list. */
const INTERACTIVE_TOOLS = new Set(["ask_user", "propose_generation"]);

let localId = 0;
const nextId = (prefix: string) => `${prefix}-live-${(localId += 1)}`;

function pushStep(items: TranscriptItem[], step: AgentStep): TranscriptItem[] {
  const last = items[items.length - 1];
  if (last?.kind === "steps") return [...items.slice(0, -1), { ...last, steps: [...last.steps, step] }];
  return [...items, { id: `steps-${step.callId}`, kind: "steps", steps: [step] }];
}

function endStreaming(items: TranscriptItem[]): TranscriptItem[] {
  const last = items[items.length - 1];
  return last?.kind === "assistant" && last.streaming ? [...items.slice(0, -1), { ...last, streaming: false }] : items;
}

export function cardFromPending(pending: CanvasAgentPending): TranscriptItem {
  if (pending.kind === "questions") {
    return { callId: pending.callId, id: `card-${pending.callId}`, kind: "questions", questions: pending.questions, state: "open" };
  }
  return {
    callId: pending.callId, id: `card-${pending.callId}`, kind: "generation", plan: pending.plan,
    state: pending.kind === "canvas_generate" ? "generating" : "approval",
  };
}

/** Rebuild the transcript from stored history (reopening a session or after a stream ends). */
export function transcriptFromHistory(messages: CanvasAgentStoredMessage[], session: CanvasAgentSession | null): TranscriptItem[] {
  let items: TranscriptItem[] = [];
  for (const message of messages) {
    if (message.role === "user") { items.push({ id: message.id, kind: "user", text: message.content }); continue; }
    if (message.role === "assistant") {
      if (message.content.trim()) items.push({ id: message.id, kind: "assistant", streaming: false, text: message.content });
      continue;
    }
    const display = message.display ?? {};
    const callId = message.toolCallId ?? message.id;
    const card = display.card;
    if (card?.kind === "questions" && card.questions) {
      const state: QuestionsCardState = display.superseded ? "skipped" : display.cancelled ? "cancelled" : "answered";
      items.push({ answers: card.answers, callId, id: `card-${callId}`, kind: "questions", questions: card.questions, state });
      continue;
    }
    if (card?.kind === "generation" && card.plan) {
      const state: GenerationCardState = display.superseded ? "skipped" : display.cancelled ? "cancelled" : card.approved === false ? "rejected" : "done";
      items.push({ callId, id: `card-${callId}`, kind: "generation", plan: card.plan, results: card.results, state });
      continue;
    }
    items = pushStep(items, {
      callId, durationMs: display.durationMs, name: message.toolName ?? "tool", status: display.ok === false ? "failed" : "ok",
      summary: display.summary, title: display.title ?? message.toolName ?? "工具",
    });
  }
  if (session?.pending) items.push(cardFromPending(session.pending));
  return items;
}

/** Fold one live SSE event into the transcript. */
export function applyAgentEvent(items: TranscriptItem[], event: CanvasAgentEvent): TranscriptItem[] {
  switch (event.type) {
    case "text_delta": {
      const last = items[items.length - 1];
      if (last?.kind === "assistant" && last.streaming) return [...items.slice(0, -1), { ...last, text: last.text + event.text }];
      return [...items, { id: nextId("assistant"), kind: "assistant", streaming: true, text: event.text }];
    }
    case "tool_started":
      // Interactive tools show up as a card via the "waiting" event.
      if (INTERACTIVE_TOOLS.has(event.name)) return endStreaming(items);
      return pushStep(endStreaming(items), { callId: event.callId, name: event.name, status: "running", title: event.title });
    case "tool_finished": {
      const finished: AgentStep = {
        callId: event.callId, durationMs: event.durationMs, name: event.name,
        status: event.ok ? "ok" : "failed", summary: event.summary, title: event.title,
      };
      if (INTERACTIVE_TOOLS.has(event.name)) return event.ok ? items : pushStep(items, finished);
      let found = false;
      const updated = items.map((item) => {
        if (item.kind !== "steps" || !item.steps.some((step) => step.callId === event.callId)) return item;
        found = true;
        return { ...item, steps: item.steps.map((step) => (step.callId === event.callId ? finished : step)) };
      });
      return found ? updated : pushStep(items, finished);
    }
    case "waiting": {
      const card = cardFromPending(event.pending);
      const index = items.findIndex((item) => item.id === card.id);
      return index >= 0 ? items.map((item, i) => (i === index ? card : item)) : [...endStreaming(items), card];
    }
    case "done":
      return endStreaming(items).map((item) => (item.kind === "steps" && item.steps.some((s) => s.status === "running")
        ? { ...item, steps: item.steps.map((s) => (s.status === "running" ? { ...s, status: "stopped" as const } : s)) }
        : item));
    case "error":
      return [...endStreaming(items), { id: nextId("error"), kind: "error", message: event.message }];
    default:
      return items;
  }
}

/** Change the state of a card in place (optimistic UI after the user acts on it). */
export function updateCard(items: TranscriptItem[], callId: string, patch: Partial<{ answers: CanvasAgentQuestionAnswer[]; state: GenerationCardState | QuestionsCardState }>): TranscriptItem[] {
  return items.map((item) => ((item.kind === "questions" || item.kind === "generation") && item.callId === callId
    ? ({ ...item, ...patch } as TranscriptItem)
    : item));
}

/** Labels for the answer summary shown right after the user submits. */
export function summarizeAnswers(questions: CanvasAgentQuestion[], answers: Array<{ optionIds?: string[]; questionId: string; text?: string }>): CanvasAgentQuestionAnswer[] {
  return answers.flatMap((answer) => {
    const question = questions.find((item) => item.id === answer.questionId);
    if (!question) return [];
    const selected = (answer.optionIds ?? []).map((id) => question.options.find((option) => option.id === id)?.label).filter((label): label is string => Boolean(label));
    return [{ question: question.prompt, questionId: question.id, selected, ...(answer.text ? { text: answer.text } : {}) }];
  });
}
