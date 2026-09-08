import {
  AGENT_V6_ID_MAX_LENGTH,
  AGENT_V6_LABEL_MAX_LENGTH,
  AGENT_V6_MAX_ITEMS,
  AGENT_V6_TEXT_MAX_LENGTH,
  type AgentOption,
  type ConversationBlock,
  type ProgressStep,
  type ResultRef,
} from "./conversationTypes";

const asRecord = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown, max = AGENT_V6_TEXT_MAX_LENGTH) => typeof value === "string" ? value.slice(0, max) : "";
const label = (value: unknown) => text(value, AGENT_V6_LABEL_MAX_LENGTH);
const id = (value: unknown) => text(value, AGENT_V6_ID_MAX_LENGTH);
const bounded = <T>(items: T[]) => items.slice(0, AGENT_V6_MAX_ITEMS);

function option(value: unknown): AgentOption | undefined {
  const raw = asRecord(value);
  const optionId = id(raw.id);
  const optionLabel = label(raw.label);
  return optionId && optionLabel ? { id: optionId, label: optionLabel, ...(typeof raw.description === "string" ? { description: label(raw.description) } : {}) } : undefined;
}

function progress(value: unknown): ProgressStep | undefined {
  const raw = asRecord(value);
  const stepId = id(raw.id);
  const stepLabel = label(raw.label);
  const statuses = ["pending", "running", "completed", "failed"] as const;
  const status = statuses.includes(raw.status as typeof statuses[number]) ? raw.status as ProgressStep["status"] : "pending";
  return stepId && stepLabel ? { id: stepId, label: stepLabel, status, ...(typeof raw.detail === "string" ? { detail: label(raw.detail) } : {}) } : undefined;
}

function result(value: unknown): ResultRef | undefined {
  const raw = asRecord(value);
  const resultId = id(raw.id);
  const resultLabel = label(raw.label);
  const statuses = ["ready", "selected", "failed"] as const;
  const status = statuses.includes(raw.status as typeof statuses[number]) ? raw.status as ResultRef["status"] : undefined;
  return resultId && resultLabel ? {
    id: resultId,
    label: resultLabel,
    ...(typeof raw.assetId === "string" ? { assetId: id(raw.assetId) } : {}),
    ...(typeof raw.nodeId === "string" ? { nodeId: id(raw.nodeId) } : {}),
    ...(status ? { status } : {}),
  } : undefined;
}

function normalizeOne(value: unknown): ConversationBlock | undefined {
  const raw = asRecord(value);
  const type = raw.type;
  if (type === "paragraph" || type === "quote") return { type, text: text(raw.text) };
  if (type === "heading") return { type, level: raw.level === 1 || raw.level === 3 ? raw.level : 2, text: text(raw.text) };
  if (type === "bullet_list" || type === "numbered_list") return { type, items: bounded(Array.isArray(raw.items) ? raw.items.map((item) => label(item)).filter(Boolean) : []) };
  if (type === "choice_grid") {
    const options = bounded(Array.isArray(raw.options) ? raw.options.map(option).filter((item): item is AgentOption => Boolean(item)) : []);
    if (!options.length) return undefined;
    return { type, ...(id(raw.id) ? { id: id(raw.id) } : {}), ...(label(raw.title) ? { title: label(raw.title) } : {}), options, selectionMode: raw.selectionMode === "multiple" ? "multiple" : "single" };
  }
  if (type === "comparison_table") {
    const columns = bounded(Array.isArray(raw.columns) ? raw.columns.map(label).filter(Boolean) : []);
    const rows = bounded(Array.isArray(raw.rows) ? raw.rows.map((row) => bounded(Array.isArray(row) ? row.map(label) : [])).filter((row) => row.length > 0) : []);
    return columns.length ? { type, ...(label(raw.title) ? { title: label(raw.title) } : {}), columns, rows } : undefined;
  }
  if (type === "brief_card") {
    const fields = bounded(Array.isArray(raw.fields) ? raw.fields.map((field) => { const item = asRecord(field); return label(item.label) && text(item.value) ? { label: label(item.label), value: text(item.value) } : undefined; }).filter((field): field is { label: string; value: string } => Boolean(field)) : []);
    return { type, ...(label(raw.title) ? { title: label(raw.title) } : {}), fields, editable: raw.editable === true };
  }
  if (type === "confirmation_card") {
    const plan = asRecord(raw.plan);
    return {
      type,
      ...(label(raw.title) ? { title: label(raw.title) } : {}),
      text: text(raw.text),
      plan: {
        ...(label(plan.title) ? { title: label(plan.title) } : {}),
        ...(label(plan.summary) ? { summary: label(plan.summary) } : {}),
        ...(typeof plan.costCredits === "number" ? { costCredits: Math.max(0, plan.costCredits) } : {}),
        ...(plan.batch === true ? { batch: true } : {}),
        ...(plan.writesCanvas === true ? { writesCanvas: true } : {}),
        ...(plan.skill === true ? { skill: true } : {}),
        ...(plan.app === true ? { app: true } : {}),
      },
    };
  }
  if (type === "progress_card") return { type, ...(label(raw.title) ? { title: label(raw.title) } : {}), steps: bounded(Array.isArray(raw.steps) ? raw.steps.map(progress).filter((step): step is ProgressStep => Boolean(step)) : []) };
  if (type === "result_group") return { type, ...(label(raw.title) ? { title: label(raw.title) } : {}), results: bounded(Array.isArray(raw.results) ? raw.results.map(result).filter((item): item is ResultRef => Boolean(item)) : []) };
  if (type === "divider") return { type: "divider" };
  return undefined;
}

export function normalizeBlocks(input: unknown): ConversationBlock[] {
  const values = Array.isArray(input) ? input : [input];
  return bounded(values.map(normalizeOne).filter((block): block is ConversationBlock => Boolean(block)));
}
