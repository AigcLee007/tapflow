export type CanvasPlacementInput = {
  assetId: string;
  expectedGraphRevision: number;
  resultId: string;
  sessionId: string;
  turnId: string;
};

export type CanvasPlacementResult = {
  graphRevision: number;
};

export type CanvasPlacementPort = {
  place(input: CanvasPlacementInput): Promise<CanvasPlacementResult>;
};

export class RevisionConflictError extends Error {
  readonly code = "REVISION_CONFLICT" as const;
  readonly status = 409 as const;

  constructor(
    readonly expectedGraphRevision: number | null,
    readonly actualGraphRevision?: number,
  ) {
    super(
      expectedGraphRevision === null
        ? "An expected graph revision is required before placement"
        : `Graph revision ${expectedGraphRevision} is stale`,
    );
    this.name = "RevisionConflictError";
  }
}

function isRevisionConflict(error: unknown): error is { actualGraphRevision?: number; code?: string; status?: number } {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { actualGraphRevision?: unknown; code?: unknown; status?: unknown };
  return candidate.status === 409 || candidate.code === "REVISION_CONFLICT";
}

export class CanvasPlacementController {
  constructor(private readonly port: CanvasPlacementPort) {}

  async place(input: CanvasPlacementInput): Promise<CanvasPlacementResult> {
    if (!Number.isInteger(input.expectedGraphRevision) || input.expectedGraphRevision < 0) {
      throw new RevisionConflictError(null);
    }

    try {
      return await this.port.place({
        assetId: input.assetId,
        expectedGraphRevision: input.expectedGraphRevision,
        resultId: input.resultId,
        sessionId: input.sessionId,
        turnId: input.turnId,
      });
    } catch (error) {
      if (isRevisionConflict(error)) {
        throw new RevisionConflictError(input.expectedGraphRevision, typeof error.actualGraphRevision === "number" ? error.actualGraphRevision : undefined);
      }
      throw error;
    }
  }
}
