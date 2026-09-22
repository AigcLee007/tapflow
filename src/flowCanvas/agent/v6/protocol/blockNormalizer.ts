import {
  AGENT_V6_LABEL_MAX_LENGTH,
  AGENT_V6_MAX_ITEMS,
  AGENT_V6_TEXT_MAX_LENGTH,
  type AgentOption,
  type ConversationBlock,
  type ProgressStep,
  type ResultRef,
} from "./conversationTypes";
import { normalizeStableId } from "./stableId";

const asRecord = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown, max = AGENT_V6_TEXT_MAX_LENGTH) => typeof value === "string" ? value.slice(0, max) : "";
const label = (value: unknown) => text(value, AGENT_V6_LABEL_MAX_LENGTH);
const id = (value: unknown) => normalizeStableId(value) ?? "";
const bounded = <T>(items: T[]) => items.slice(0, AGENT_V6_MAX_ITEMS);
const array = <T>(value: unknown) => Array.isArray(value) ? bounded(value) : [];
const optionalId = (raw: Record<string, unknown>) => {
  const normalized = id(raw.id);
  return normalized ? { id: normalized } : {};
};
const optionalLocked = (raw: Record<string, unknown>) => typeof raw.locked === "boolean" ? { locked: raw.locked } : {};

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
  const kind = raw.kind === "image" || raw.kind === "video" || raw.kind === "text" ? raw.kind : undefined;
  const contentText = typeof raw.contentText === "string" ? text(raw.contentText) : undefined;
  const assetId = raw.assetId === undefined ? undefined : id(raw.assetId);
  const nodeId = raw.nodeId === undefined ? undefined : id(raw.nodeId);
  const refId = raw.refId === undefined ? undefined : id(raw.refId);
  const runId = raw.runId === undefined ? undefined : id(raw.runId);
  const placedNodeId = raw.placedNodeId === undefined ? undefined : id(raw.placedNodeId);
  const sourceRefs = raw.sourceRefs === undefined ? undefined : Array.isArray(raw.sourceRefs) ? array(raw.sourceRefs).map(id) : undefined;
  const uploadedAssetIds = raw.uploadedAssetIds === undefined ? undefined : Array.isArray(raw.uploadedAssetIds) ? array(raw.uploadedAssetIds).map(id) : undefined;
  if (!resultId || !resultLabel || (raw.assetId !== undefined && !assetId) || (raw.nodeId !== undefined && !nodeId) || (raw.refId !== undefined && !refId) || (raw.runId !== undefined && !runId) || (raw.placedNodeId !== undefined && !placedNodeId) || (raw.sourceRefs !== undefined && (!Array.isArray(raw.sourceRefs) || sourceRefs?.some((value) => !value))) || (raw.uploadedAssetIds !== undefined && (!Array.isArray(raw.uploadedAssetIds) || uploadedAssetIds?.some((value) => !value)))) return undefined;
  return {
    id: resultId,
    label: resultLabel,
    ...(kind ? { kind } : {}),
    ...(contentText ? { contentText } : {}),
    ...(assetId ? { assetId } : {}),
    ...(nodeId ? { nodeId } : {}),
    ...(refId ? { refId } : {}),
    ...(runId ? { runId } : {}),
    ...(placedNodeId ? { placedNodeId } : {}),
    ...(sourceRefs?.length ? { sourceRefs } : {}),
    ...(uploadedAssetIds ? { uploadedAssetIds } : {}),
    ...(status ? { status } : {}),
  };
}

function normalizeOne(value: unknown): ConversationBlock | undefined {
  const raw = asRecord(value);
  const type = raw.type;
  if (type === "understanding") return { type, ...optionalId(raw), ...(label(raw.title) ? { title: label(raw.title) } : {}), text: text(raw.text), ...optionalLocked(raw) };
  if (type === "question") {
    const questionId = id(raw.id);
    return questionId ? { type, id: questionId, ...(label(raw.title) ? { title: label(raw.title) } : {}), prompt: text(raw.prompt), options: array(raw.options).map(label).filter(Boolean), ...optionalLocked(raw) } : undefined;
  }
  if (type === "paragraph" || type === "quote") return { type, text: text(raw.text), ...optionalLocked(raw) };
  if (type === "heading") return { type, level: raw.level === 1 || raw.level === 3 ? raw.level : 2, text: text(raw.text), ...optionalLocked(raw) };
  if (type === "bullet_list" || type === "numbered_list") return { type, items: array(raw.items).map((item) => label(item)).filter(Boolean), ...optionalLocked(raw) };
  if (type === "choice_grid") {
    const options = array(raw.options).map(option).filter((item): item is AgentOption => Boolean(item));
    if (!options.length) return undefined;
    const optionIds = new Set(options.map((item) => item.id));
    const selectedOptionIds = array(raw.selectedOptionIds).map(id).filter((item) => optionIds.has(item));
    return { type, ...optionalId(raw), ...(label(raw.title) ? { title: label(raw.title) } : {}), options, selectionMode: raw.selectionMode === "multiple" ? "multiple" : "single", ...(selectedOptionIds.length ? { selectedOptionIds } : {}), ...optionalLocked(raw) };
  }
  if (type === "comparison_table") {
    const columns = array(raw.columns).map(label).filter(Boolean);
    const rows = array(raw.rows).map((row) => array(row).map(label)).filter((row) => row.length > 0);
    return columns.length ? { type, ...(label(raw.title) ? { title: label(raw.title) } : {}), columns, rows, ...optionalLocked(raw) } : undefined;
  }
  if (type === "brief_card") {
    const fields = array(raw.fields).map((field) => { const item = asRecord(field); return label(item.label) && text(item.value) ? { label: label(item.label), value: text(item.value) } : undefined; }).filter((field): field is { label: string; value: string } => Boolean(field));
    return { type, ...optionalId(raw), ...(label(raw.title) ? { title: label(raw.title) } : {}), fields, editable: raw.editable === true, ...optionalLocked(raw) };
  }
  if (type === "confirmation_card") {
    const plan = asRecord(raw.plan);
    const policy = asRecord(plan.serverPolicy);
    const policyHash = id(policy.policyHash);
    return {
      type,
      ...optionalId(raw),
      ...(label(raw.title) ? { title: label(raw.title) } : {}),
      text: text(raw.text),
      plan: {
        ...(label(plan.title) ? { title: label(plan.title) } : {}),
        ...(label(plan.summary) ? { summary: label(plan.summary) } : {}),
        ...(typeof plan.costCredits === "number" && Number.isFinite(plan.costCredits) ? { costCredits: Math.max(0, plan.costCredits) } : {}),
        ...(typeof policy.requiresConfirmation === "boolean" && policyHash ? { serverPolicy: { requiresConfirmation: policy.requiresConfirmation, policyHash } } : {}),
        ...(plan.batch === true ? { batch: true } : {}),
        ...(plan.writesCanvas === true ? { writesCanvas: true } : {}),
        ...(plan.skill === true ? { skill: true } : {}),
        ...(plan.app === true ? { app: true } : {}),
      },
      ...optionalLocked(raw),
    };
  }
  if (type === "progress_card") return { type, ...optionalId(raw), ...(label(raw.title) ? { title: label(raw.title) } : {}), steps: array(raw.steps).map(progress).filter((step): step is ProgressStep => Boolean(step)), ...optionalLocked(raw) };
  if (type === "result_group") return { type, ...optionalId(raw), ...(label(raw.title) ? { title: label(raw.title) } : {}), results: array(raw.results).map(result).filter((item): item is ResultRef => Boolean(item)), ...optionalLocked(raw) };
  if (type === "divider") return { type: "divider", ...optionalLocked(raw) };
  return undefined;
}

function normalizeCanonical(value: unknown): ConversationBlock[] | null {
  const raw = asRecord(value);
  if (raw.type === "question_set") {
    return array(raw.questions).flatMap((entry) => {
      const question = asRecord(entry);
      const questionId = id(question.id);
      const prompt = text(question.prompt);
      if (!questionId || !prompt) return [];
      const options = array(question.options).map(option).filter((item): item is AgentOption => Boolean(item));
      if (question.kind === "text") return [{ type: "question", id: questionId, title: prompt, prompt, options: [] }];
      return options.length ? [{ type: "choice_grid", id: questionId, title: prompt, options, selectionMode: question.kind === "multiple" ? "multiple" : "single" }] : [];
    });
  }
  if (raw.type === "brief") {
    const fields = array(raw.fields).flatMap((entry) => {
      const field = asRecord(entry);
      const fieldLabel = label(field.label);
      const valueText = text(field.value);
      return fieldLabel && valueText ? [{ label: fieldLabel, value: valueText }] : [];
    });
    return [{ type: "brief_card", ...optionalId(raw), fields, editable: raw.editable === true }];
  }
  if (raw.type === "plan") {
    const deliverables = array(raw.deliverables).flatMap((entry) => {
      const item = asRecord(entry);
      const itemLabel = label(item.label);
      const kind = item.kind === "image" ? "图片" : item.kind === "video" ? "视频" : "文本";
      const quantity = typeof item.quantity === "number" && Number.isFinite(item.quantity) ? ` × ${item.quantity}` : "";
      return itemLabel ? [`${kind}：${itemLabel}${quantity}`] : [];
    });
    const details = [
      typeof raw.quantity === "number" ? `数量：${raw.quantity}` : "",
      typeof raw.estimatedCredits === "number" ? `预计费用：${raw.estimatedCredits} 积分` : "",
      array(raw.references).length ? `引用：${array(raw.references).map(id).filter(Boolean).join("、")}` : "",
      array(raw.writes).length ? `写入范围：${array(raw.writes).map(label).filter(Boolean).join("、")}` : "",
    ].filter(Boolean);
    return [
      { type: "heading", level: 3, text: label(raw.title) || "执行计划" },
      ...(text(raw.summary) ? [{ type: "paragraph" as const, text: text(raw.summary) }] : []),
      ...(deliverables.length ? [{ type: "bullet_list" as const, items: deliverables }] : []),
      ...(details.length ? [{ type: "bullet_list" as const, items: details }] : []),
    ];
  }
  if (raw.type === "confirmation") {
    const writes = array(raw.writes).map(label).filter(Boolean);
    const summary = [typeof raw.quantity === "number" ? `共 ${raw.quantity} 项交付` : "", writes.length ? `写入：${writes.join("、")}` : ""].filter(Boolean).join("；");
    return [{ type: "confirmation_card", ...optionalId(raw), text: text(raw.text), plan: { ...(typeof raw.costCredits === "number" && Number.isFinite(raw.costCredits) ? { costCredits: Math.max(0, raw.costCredits) } : {}), ...(summary ? { summary } : {}) } }];
  }
  if (raw.type === "progress") return [{ type: "progress_card", ...optionalId(raw), steps: array(raw.steps).map(progress).filter((item): item is ProgressStep => Boolean(item)) }];
  if (raw.type === "error_recovery") {
    const options = array(raw.actions).flatMap((entry) => {
      const action = asRecord(entry);
      const actionId = id(action.action);
      const actionLabel = label(action.label);
      return actionId && actionLabel ? [{ id: actionId, label: actionLabel }] : [];
    });
    return [
      { type: "paragraph", text: text(raw.message) },
      ...(options.length ? [{ type: "choice_grid" as const, id: id(raw.id) || "recovery", title: "恢复任务", options, selectionMode: "single" as const }] : []),
    ];
  }
  return null;
}

export function normalizeBlocks(input: unknown): ConversationBlock[] {
  const values = Array.isArray(input) ? bounded(input) : [input];
  return values.flatMap((value) => normalizeCanonical(value) ?? [normalizeOne(value)].filter((block): block is ConversationBlock => Boolean(block)));
}
