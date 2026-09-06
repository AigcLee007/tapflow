/** Safe, provider-agnostic blocks used to render an agent turn. */

export const CONVERSATION_BLOCK_MAX_ITEMS = 12;
export const CONVERSATION_TEXT_MAX_LENGTH = 4000;

export type AgentOption = { id: string; label: string; description?: string };
export type BriefField = { label: string; value: string };
export type CapabilitySummary = { id: string; name: string; description?: string; status?: "available" | "unavailable" | "running" };
export type ProgressStep = { id: string; label: string; status: "pending" | "running" | "completed" | "failed" };
export type ResultRef = { id: string; label: string; assetId?: string; nodeId?: string; status?: "ready" | "selected" | "failed" };

export type ConversationBlock =
  | { type: "paragraph"; text: string }
  | { type: "question"; id?: string; text: string; multiple?: boolean; options?: AgentOption[] }
  | { type: "choices"; id?: string; title?: string; options: AgentOption[]; multiple?: boolean }
  | { type: "comparison"; title?: string; columns: string[]; rows: Array<{ label: string; values: string[] }> }
  | { type: "brief"; title?: string; fields: BriefField[] }
  | { type: "capability"; title?: string; capabilities: CapabilitySummary[] }
  | { type: "confirmation"; title?: string; text: string; costCredits?: number; risk?: string }
  | { type: "progress"; title?: string; steps: ProgressStep[] }
  | { type: "results"; title?: string; results: ResultRef[] };

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const stringValue = (value: unknown, max = CONVERSATION_TEXT_MAX_LENGTH): string | undefined =>
  typeof value === "string" && value.trim() ? value.slice(0, max) : undefined;
const bounded = <T>(items: T[]): T[] => items.slice(0, CONVERSATION_BLOCK_MAX_ITEMS);
const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter(isRecord).slice(0, CONVERSATION_BLOCK_MAX_ITEMS) : [];

function option(value: unknown): AgentOption | undefined {
  if (!isRecord(value)) return undefined;
  const id = stringValue(value.id, 200);
  const label = stringValue(value.label, 400);
  if (!id || !label) return undefined;
  const description = stringValue(value.description, 1000);
  return description ? { id, label, description } : { id, label };
}

export function normalizeConversationBlocks(input: unknown): ConversationBlock[] {
  if (typeof input === "string") {
    const text = stringValue(input);
    return text ? [{ type: "paragraph", text }] : [];
  }
  if (!Array.isArray(input)) return [];

  return bounded(input.flatMap((raw): ConversationBlock[] => {
    if (!isRecord(raw) || typeof raw.type !== "string") return [];
    const type = raw.type;
    if (type === "paragraph") {
      const text = stringValue(raw.text);
      return text ? [{ type, text }] : [];
    }
    if (type === "question" || type === "choices") {
      const options = bounded(records(raw.options).flatMap((item) => { const parsed = option(item); return parsed ? [parsed] : []; }));
      const text = stringValue(raw.text);
      const title = stringValue(raw.title, 400);
      if (type === "question" && !text) return [];
      if (type === "choices" && !options.length) return [];
      const block = type === "question"
        ? { type, ...(stringValue(raw.id, 200) ? { id: stringValue(raw.id, 200) } : {}), text, ...(raw.multiple === true ? { multiple: true } : {}), ...(options.length ? { options } : {}) }
        : { type, ...(stringValue(raw.id, 200) ? { id: stringValue(raw.id, 200) } : {}), ...(title ? { title } : {}), options, ...(raw.multiple === true ? { multiple: true } : {}) };
      return [block as ConversationBlock];
    }
    if (type === "brief") {
      const fields = bounded(records(raw.fields).flatMap((item) => { const label = stringValue(item.label, 400); const value = stringValue(item.value); return label && value ? [{ label, value }] : []; }));
      return fields.length ? [{ type, ...(stringValue(raw.title, 400) ? { title: stringValue(raw.title, 400) } : {}), fields }] : [];
    }
    if (type === "confirmation") {
      const text = stringValue(raw.text); if (!text) return [];
      return [{ type, ...(stringValue(raw.title, 400) ? { title: stringValue(raw.title, 400) } : {}), text, ...(typeof raw.costCredits === "number" && Number.isFinite(raw.costCredits) && raw.costCredits >= 0 ? { costCredits: raw.costCredits } : {}), ...(stringValue(raw.risk, 1000) ? { risk: stringValue(raw.risk, 1000) } : {}) }];
    }
    if (type === "comparison") {
      const columns = bounded(Array.isArray(raw.columns) ? raw.columns.flatMap((value) => { const text = stringValue(value, 400); return text ? [text] : []; }) : []);
      const rows = bounded(records(raw.rows).flatMap((item) => {
        const label = stringValue(item.label, 400);
        const values = bounded(Array.isArray(item.values) ? item.values.flatMap((value) => { const text = stringValue(value, 1000); return text ? [text] : []; }) : []);
        return label && values.length ? [{ label, values }] : [];
      }));
      return columns.length && rows.length ? [{ type, ...(stringValue(raw.title, 400) ? { title: stringValue(raw.title, 400) } : {}), columns, rows }] : [];
    }
    if (type === "capability") {
      const capabilities = bounded(records(raw.capabilities).flatMap((item) => {
        const id = stringValue(item.id, 200); const name = stringValue(item.name, 400);
        const status = item.status === "available" || item.status === "unavailable" || item.status === "running" ? item.status : undefined;
        return id && name ? [{ id, name, ...(stringValue(item.description, 1000) ? { description: stringValue(item.description, 1000) } : {}), ...(status ? { status } : {}) }] : [];
      }));
      return capabilities.length ? [{ type, ...(stringValue(raw.title, 400) ? { title: stringValue(raw.title, 400) } : {}), capabilities }] : [];
    }
    if (type === "progress") {
      const steps = bounded(records(raw.steps).flatMap((item) => {
        const id = stringValue(item.id, 200); const label = stringValue(item.label, 400);
        const status = item.status === "pending" || item.status === "running" || item.status === "completed" || item.status === "failed" ? item.status : undefined;
        return id && label && status ? [{ id, label, status }] : [];
      }));
      return steps.length ? [{ type, ...(stringValue(raw.title, 400) ? { title: stringValue(raw.title, 400) } : {}), steps }] : [];
    }
    if (type === "results") {
      const results = bounded(records(raw.results).flatMap((item) => {
        const id = stringValue(item.id, 200); const label = stringValue(item.label, 400);
        const status = item.status === "ready" || item.status === "selected" || item.status === "failed" ? item.status : undefined;
        return id && label ? [{ id, label, ...(stringValue(item.assetId, 200) ? { assetId: stringValue(item.assetId, 200) } : {}), ...(stringValue(item.nodeId, 200) ? { nodeId: stringValue(item.nodeId, 200) } : {}), ...(status ? { status } : {}) }] : [];
      }));
      return results.length ? [{ type, ...(stringValue(raw.title, 400) ? { title: stringValue(raw.title, 400) } : {}), results }] : [];
    }
    return [];
  }));
}
