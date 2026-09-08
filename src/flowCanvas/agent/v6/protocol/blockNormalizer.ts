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
  const assetId = raw.assetId === undefined ? undefined : id(raw.assetId);
  const nodeId = raw.nodeId === undefined ? undefined : id(raw.nodeId);
  const refId = raw.refId === undefined ? undefined : id(raw.refId);
  const uploadedAssetIds = raw.uploadedAssetIds === undefined ? undefined : array(raw.uploadedAssetIds).map(id);
  if (!resultId || !resultLabel || (raw.assetId !== undefined && !assetId) || (raw.nodeId !== undefined && !nodeId) || (raw.refId !== undefined && !refId) || (raw.uploadedAssetIds !== undefined && (!uploadedAssetIds?.length || uploadedAssetIds.some((value) => !value)))) return undefined;
  return {
    id: resultId,
    label: resultLabel,
    ...(assetId ? { assetId } : {}),
    ...(nodeId ? { nodeId } : {}),
    ...(refId ? { refId } : {}),
    ...(uploadedAssetIds ? { uploadedAssetIds } : {}),
    ...(status ? { status } : {}),
  };
}

function normalizeOne(value: unknown): ConversationBlock | undefined {
  const raw = asRecord(value);
  const type = raw.type;
  if (type === "paragraph" || type === "quote") return { type, text: text(raw.text) };
  if (type === "heading") return { type, level: raw.level === 1 || raw.level === 3 ? raw.level : 2, text: text(raw.text) };
  if (type === "bullet_list" || type === "numbered_list") return { type, items: array(raw.items).map((item) => label(item)).filter(Boolean) };
  if (type === "choice_grid") {
    const options = array(raw.options).map(option).filter((item): item is AgentOption => Boolean(item));
    if (!options.length) return undefined;
    const optionIds = new Set(options.map((item) => item.id));
    const selectedOptionIds = array(raw.selectedOptionIds).map(id).filter((item) => optionIds.has(item));
    return { type, ...(id(raw.id) ? { id: id(raw.id) } : {}), ...(label(raw.title) ? { title: label(raw.title) } : {}), options, selectionMode: raw.selectionMode === "multiple" ? "multiple" : "single", ...(selectedOptionIds.length ? { selectedOptionIds } : {}) };
  }
  if (type === "comparison_table") {
    const columns = array(raw.columns).map(label).filter(Boolean);
    const rows = array(raw.rows).map((row) => array(row).map(label)).filter((row) => row.length > 0);
    return columns.length ? { type, ...(label(raw.title) ? { title: label(raw.title) } : {}), columns, rows } : undefined;
  }
  if (type === "brief_card") {
    const fields = array(raw.fields).map((field) => { const item = asRecord(field); return label(item.label) && text(item.value) ? { label: label(item.label), value: text(item.value) } : undefined; }).filter((field): field is { label: string; value: string } => Boolean(field));
    return { type, ...(label(raw.title) ? { title: label(raw.title) } : {}), fields, editable: raw.editable === true };
  }
  if (type === "confirmation_card") {
    const plan = asRecord(raw.plan);
    const policy = asRecord(plan.serverPolicy);
    const policyHash = id(policy.policyHash);
    return {
      type,
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
    };
  }
  if (type === "progress_card") return { type, ...(label(raw.title) ? { title: label(raw.title) } : {}), steps: array(raw.steps).map(progress).filter((step): step is ProgressStep => Boolean(step)) };
  if (type === "result_group") return { type, ...(label(raw.title) ? { title: label(raw.title) } : {}), results: array(raw.results).map(result).filter((item): item is ResultRef => Boolean(item)) };
  if (type === "divider") return { type: "divider" };
  return undefined;
}

export function normalizeBlocks(input: unknown): ConversationBlock[] {
  const values = Array.isArray(input) ? bounded(input) : [input];
  return values.map(normalizeOne).filter((block): block is ConversationBlock => Boolean(block));
}
