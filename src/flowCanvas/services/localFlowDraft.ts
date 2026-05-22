import type { FlowDraftGraph } from "./flowProjectApi";
import { canonicalizeGraph, hashGraph } from "../utils/canonicalGraph";

export type LocalFlowDraft = {
  canonicalGraph: FlowDraftGraph;
  flowId: string;
  lastServerRevision: number | null;
  localVersion: number;
  tenantId: string;
  updatedAt: string;
};

export function getLocalFlowDraftKey(input: {
  flowId: string;
  tenantId: string;
}): string {
  return `tapflow:draft:${input.tenantId}:${input.flowId}`;
}

export function readLocalFlowDraft(input: {
  flowId: string;
  tenantId: string;
}): LocalFlowDraft | null {
  if (!canUseLocalStorage()) return null;
  const raw = window.localStorage.getItem(getLocalFlowDraftKey(input));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<LocalFlowDraft>;
    if (!parsed.flowId || !parsed.tenantId || !parsed.canonicalGraph || !parsed.updatedAt) {
      return null;
    }
    return {
      canonicalGraph: canonicalizeGraph(parsed.canonicalGraph),
      flowId: parsed.flowId,
      lastServerRevision:
        typeof parsed.lastServerRevision === "number" ? parsed.lastServerRevision : null,
      localVersion: typeof parsed.localVersion === "number" ? parsed.localVersion : 1,
      tenantId: parsed.tenantId,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

export function writeLocalFlowDraft(input: {
  flowId: string;
  graph: FlowDraftGraph;
  lastServerRevision: number | null;
  previousLocalVersion?: number | null;
  tenantId: string;
}): LocalFlowDraft | null {
  if (!canUseLocalStorage()) return null;
  const draft: LocalFlowDraft = {
    canonicalGraph: canonicalizeGraph(input.graph),
    flowId: input.flowId,
    lastServerRevision: input.lastServerRevision,
    localVersion: (input.previousLocalVersion ?? 0) + 1,
    tenantId: input.tenantId,
    updatedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(getLocalFlowDraftKey(input), JSON.stringify(draft));
  return draft;
}

export function isLocalDraftNewer(input: {
  localDraft: LocalFlowDraft | null;
  serverGraph: FlowDraftGraph;
  serverUpdatedAt: string;
}): boolean {
  if (!input.localDraft) return false;
  const localTime = Date.parse(input.localDraft.updatedAt) || 0;
  const serverTime = Date.parse(input.serverUpdatedAt) || 0;
  return localTime > serverTime && hashGraph(input.localDraft.canonicalGraph) !== hashGraph(input.serverGraph);
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}
