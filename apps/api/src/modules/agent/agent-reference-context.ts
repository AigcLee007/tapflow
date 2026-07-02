import type { AgentReferenceContextInput } from "./agent.schemas.js";

export type AgentReferenceResolverInput = {
  continuationContext?: {
    assetId?: string;
    assetIds?: string[];
    assetRefId?: string;
    assetRefIds?: string[];
  } | null;
  previousResults?: Array<{ assetId: string; refId: string }>;
  referenceContext?: AgentReferenceContextInput;
  requestedRefs?: string[];
};

export class AgentReferenceResolutionError extends Error {
  readonly code = "AGENT_REFERENCE_NOT_FOUND";
  readonly statusCode = 400;

  constructor(reference: string) {
    super(`Agent reference not found: ${reference}`);
    this.name = "AgentReferenceResolutionError";
  }
}

export function resolveAgentReferenceAssetIds(input: AgentReferenceResolverInput): string[] {
  const knownRefs = new Map<string, string>();
  const allowedAssetIds: string[] = [];
  const continuationAssetIds = collectContinuationAssetIds(input.continuationContext);

  for (const item of input.referenceContext?.items ?? []) {
    addKnownReference(knownRefs, allowedAssetIds, item.refId, item.assetId);
  }
  for (const item of input.previousResults ?? []) {
    addKnownReference(knownRefs, allowedAssetIds, item.refId, item.assetId);
  }
  const continuationRefIds = input.continuationContext?.assetRefIds ?? (
    input.continuationContext?.assetRefId ? [input.continuationContext.assetRefId] : []
  );
  continuationAssetIds.forEach((assetId, index) => {
    const refId = continuationRefIds[index];
    if (refId) knownRefs.set(refId, assetId);
    allowedAssetIds.push(assetId);
  });

  if (!input.requestedRefs || input.requestedRefs.length === 0) {
    return dedupe(continuationAssetIds);
  }

  const allowed = new Set(allowedAssetIds);
  const resolved: string[] = [];
  for (const requestedRef of input.requestedRefs) {
    const knownAssetId = knownRefs.get(requestedRef);
    if (knownAssetId) {
      resolved.push(knownAssetId);
      continue;
    }
    if (allowed.has(requestedRef)) {
      resolved.push(requestedRef);
      continue;
    }
    throw new AgentReferenceResolutionError(requestedRef);
  }

  return dedupe(resolved);
}

function addKnownReference(
  knownRefs: Map<string, string>,
  allowedAssetIds: string[],
  refId: string,
  assetId: string,
) {
  knownRefs.set(refId, assetId);
  allowedAssetIds.push(assetId);
}

function collectContinuationAssetIds(input: AgentReferenceResolverInput["continuationContext"]): string[] {
  if (!input) return [];
  return input.assetIds?.filter(isNonEmptyString) ?? (isNonEmptyString(input.assetId) ? [input.assetId] : []);
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter(isNonEmptyString)));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
