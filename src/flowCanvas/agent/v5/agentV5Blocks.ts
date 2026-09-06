import type {
  AgentOption,
  BriefField,
  CapabilitySummary,
  ConfirmationPlan,
  ConversationBlock,
  ProgressStep,
  ResultRef,
} from "./agentV5Types";
import {
  AGENT_V5_LABEL_MAX_LENGTH,
  AGENT_V5_MAX_ITEMS,
  AGENT_V5_TEXT_MAX_LENGTH,
} from "./agentV5Types";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max = AGENT_V5_TEXT_MAX_LENGTH): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  // HTML is never part of the protocol. Strip tags from legacy model output;
  // the renderer still treats the result as plain text.
  const stripped = value.replace(/<[^>]*>/g, "").trim();
  return stripped ? stripped.slice(0, max) : undefined;
}

function id(value: unknown): string | undefined {
  const valueText = text(value, 200);
  if (!valueText || /^(?:https?:|data:|blob:)/i.test(valueText) || /(?:signature|x-amz-|token=)/i.test(valueText)) return undefined;
  return valueText;
}

function stringList(value: unknown, max = AGENT_V5_LABEL_MAX_LENGTH): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => text(item, max))
    .filter((item): item is string => Boolean(item))
    .slice(0, AGENT_V5_MAX_ITEMS);
}

function option(value: unknown): AgentOption | undefined {
  if (!isRecord(value)) return undefined;
  const optionId = id(value.id);
  const label = text(value.label, AGENT_V5_LABEL_MAX_LENGTH);
  if (!optionId || !label) return undefined;
  const description = text(value.description, 1_000);
  return description ? { id: optionId, label, description } : { id: optionId, label };
}

function options(value: unknown): AgentOption[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(option)
    .filter((item): item is AgentOption => Boolean(item))
    .slice(0, AGENT_V5_MAX_ITEMS);
}

function fields(value: unknown): BriefField[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((field) => {
      const label = text(field.label, AGENT_V5_LABEL_MAX_LENGTH);
      const valueText = text(field.value);
      return label && valueText ? { label, value: valueText } : undefined;
    })
    .filter((field): field is BriefField => Boolean(field))
    .slice(0, AGENT_V5_MAX_ITEMS);
}

function capability(value: unknown): CapabilitySummary | undefined {
  if (!isRecord(value)) return undefined;
  const capabilityId = id(value.id);
  const name = text(value.name, AGENT_V5_LABEL_MAX_LENGTH);
  if (!capabilityId || !name) return undefined;
  const description = text(value.description, 1_000);
  const status = value.status === "available" || value.status === "unavailable" || value.status === "running"
    ? value.status
    : undefined;
  return { id: capabilityId, name, ...(description ? { description } : {}), ...(status ? { status } : {}) };
}

function progressSteps(value: unknown): ProgressStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((step) => {
      const stepId = id(step.id);
      const label = text(step.label, AGENT_V5_LABEL_MAX_LENGTH);
      const status = step.status === "pending" || step.status === "running" || step.status === "completed" || step.status === "failed"
        ? step.status
        : undefined;
      const detail = text(step.detail, 1_000);
      return stepId && label && status ? { id: stepId, label, status, ...(detail ? { detail } : {}) } : undefined;
    })
    .filter((step): step is ProgressStep => Boolean(step))
    .slice(0, AGENT_V5_MAX_ITEMS);
}

function results(value: unknown): ResultRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((result) => {
      const resultId = id(result.id);
      const label = text(result.label, AGENT_V5_LABEL_MAX_LENGTH);
      if (!resultId || !label) return undefined;
      const assetId = id(result.assetId);
      const nodeId = id(result.nodeId);
      const status = result.status === "ready" || result.status === "selected" || result.status === "failed"
        ? result.status
        : undefined;
      return {
        id: resultId,
        label,
        ...(assetId ? { assetId } : {}),
        ...(nodeId ? { nodeId } : {}),
        ...(status ? { status } : {}),
      };
    })
    .filter((result): result is ResultRef => Boolean(result))
    .slice(0, AGENT_V5_MAX_ITEMS);
}

function plan(value: unknown): ConfirmationPlan {
  if (!isRecord(value)) return {};
  const costCredits = typeof value.costCredits === "number" && Number.isFinite(value.costCredits) && value.costCredits >= 0
    ? value.costCredits
    : undefined;
  const title = text(value.title, AGENT_V5_LABEL_MAX_LENGTH);
  const summary = text(value.summary);
  return {
    ...(title ? { title } : {}),
    ...(summary ? { summary } : {}),
    ...(costCredits !== undefined ? { costCredits } : {}),
    ...(typeof value.batch === "boolean" ? { batch: value.batch } : {}),
    ...(typeof value.writesCanvas === "boolean" ? { writesCanvas: value.writesCanvas } : {}),
    ...(typeof value.skill === "boolean" ? { skill: value.skill } : {}),
    ...(typeof value.app === "boolean" ? { app: value.app } : {}),
  };
}

function normalizeOne(raw: unknown): ConversationBlock | undefined {
  if (typeof raw === "string") {
    const paragraph = text(raw);
    return paragraph ? { type: "paragraph", text: paragraph } : undefined;
  }
  if (!isRecord(raw) || typeof raw.type !== "string") return undefined;

  switch (raw.type) {
    case "paragraph": {
      const value = text(raw.text);
      return value ? { type: "paragraph", text: value } : undefined;
    }
    case "heading": {
      const value = text(raw.text);
      const level = raw.level === 1 || raw.level === 2 || raw.level === 3 ? raw.level : 2;
      return value ? { type: "heading", level, text: value } : undefined;
    }
    case "quote": {
      const value = text(raw.text);
      return value ? { type: "quote", text: value } : undefined;
    }
    case "bullet_list":
    case "numbered_list": {
      const items = stringList(raw.items);
      return items.length ? { type: raw.type, items } : undefined;
    }
    case "choice_grid":
    case "choices": {
      const parsedOptions = options(raw.options);
      if (!parsedOptions.length) return undefined;
      const choiceId = id(raw.id);
      const title = text(raw.title, AGENT_V5_LABEL_MAX_LENGTH);
      const selectionMode = raw.selectionMode === "multiple" || raw.multiple === true ? "multiple" : "single";
      return {
        type: "choice_grid",
        ...(choiceId ? { id: choiceId } : {}),
        ...(title ? { title } : {}),
        options: parsedOptions,
        selectionMode,
      };
    }
    case "comparison_table": {
      const columns = stringList(raw.columns);
      const rows = Array.isArray(raw.rows)
        ? raw.rows.slice(0, AGENT_V5_MAX_ITEMS).flatMap((row) => {
            if (Array.isArray(row)) return [stringList(row, 1_000)];
            if (isRecord(row)) {
              const label = text(row.label, 1_000);
              const values = stringList(row.values, 1_000);
              return label && values.length ? [[label, ...values]] : [];
            }
            return [];
          }).filter((row) => row.length > 0)
        : [];
      const title = text(raw.title, AGENT_V5_LABEL_MAX_LENGTH);
      return columns.length && rows.length ? { type: "comparison_table", ...(title ? { title } : {}), columns, rows } : undefined;
    }
    case "brief_card": {
      const parsedFields = fields(raw.fields);
      const title = text(raw.title, AGENT_V5_LABEL_MAX_LENGTH);
      return parsedFields.length ? { type: "brief_card", ...(title ? { title } : {}), fields: parsedFields, editable: raw.editable !== false } : undefined;
    }
    case "skill_card":
    case "app_card": {
      const parsedCapability = capability(raw.capability);
      return parsedCapability ? { type: raw.type, capability: parsedCapability } : undefined;
    }
    case "confirmation_card": {
      const value = text(raw.text);
      if (!value) return undefined;
      const title = text(raw.title, AGENT_V5_LABEL_MAX_LENGTH);
      return { type: "confirmation_card", ...(title ? { title } : {}), text: value, plan: plan(raw.plan) };
    }
    case "progress_card": {
      const steps = progressSteps(raw.steps);
      const title = text(raw.title, AGENT_V5_LABEL_MAX_LENGTH);
      return steps.length ? { type: "progress_card", ...(title ? { title } : {}), steps } : undefined;
    }
    case "result_group": {
      const parsedResults = results(raw.results);
      const title = text(raw.title, AGENT_V5_LABEL_MAX_LENGTH);
      return parsedResults.length ? { type: "result_group", ...(title ? { title } : {}), results: parsedResults } : undefined;
    }
    case "divider":
      return { type: "divider" };
    default:
      return undefined;
  }
}

/** Normalize untrusted model/legacy data into the V5 renderer whitelist. */
export function normalizeAgentV5Blocks(input: unknown): ConversationBlock[] {
  const values = typeof input === "string" ? [input] : Array.isArray(input) ? input : [];
  return values
    .slice(0, AGENT_V5_MAX_ITEMS)
    .map(normalizeOne)
    .filter((block): block is ConversationBlock => Boolean(block));
}
