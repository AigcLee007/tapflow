import { createPgPool } from "@aigc-flow/db";
import type { Pool } from "pg";

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
  readonly code: string;
  readonly statusCode = 400;

  constructor(reference: string, code = "AGENT_REFERENCE_NOT_FOUND", message?: string) {
    super(message ?? `Agent reference not found: ${reference}`);
    this.code = code;
    this.name = "AgentReferenceResolutionError";
  }
}

export class AgentReferenceAssetRepository {
  readonly pool: Pool;

  constructor(options?: { pool?: Pool }) {
    this.pool = options?.pool ?? createPgPool();
  }

  async validateImageReferences(input: {
    projectId?: string | null;
    referenceContext?: AgentReferenceContextInput;
    tenantId: string;
  }): Promise<void> {
    const assetIds = dedupe((input.referenceContext?.items ?? []).map((item) => item.assetId));
    if (assetIds.length === 0) return;

    const result = await this.pool.query<{
      id: string;
      kind: string;
      project_id: string | null;
      status: string;
    }>(
      `
        SELECT id::text AS id, kind, project_id::text AS project_id, status
        FROM assets
        WHERE tenant_id = $1::uuid
          AND id = ANY($2::uuid[])
          AND deleted_at IS NULL
      `,
      [input.tenantId, assetIds],
    );
    const assetsById = new Map(result.rows.map((row) => [row.id, row]));

    for (const assetId of assetIds) {
      const asset = assetsById.get(assetId);
      if (!asset) {
        throw new AgentReferenceResolutionError(assetId);
      }
      if (asset.kind !== "image") {
        throw new AgentReferenceResolutionError(
          assetId,
          "AGENT_REFERENCE_INVALID_KIND",
          `Agent reference is not an image asset: ${assetId}`,
        );
      }
      if (asset.status !== "available") {
        throw new AgentReferenceResolutionError(
          assetId,
          "AGENT_REFERENCE_UNAVAILABLE",
          `Agent reference is not available: ${assetId}`,
        );
      }
      if (input.projectId && asset.project_id && asset.project_id !== input.projectId) {
        throw new AgentReferenceResolutionError(
          assetId,
          "AGENT_REFERENCE_PROJECT_MISMATCH",
          `Agent reference does not belong to this project: ${assetId}`,
        );
      }
    }
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
