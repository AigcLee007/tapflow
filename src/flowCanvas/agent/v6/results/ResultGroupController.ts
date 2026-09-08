import { normalizeStableId } from "../protocol/stableId";
import { CanvasPlacementController, RevisionConflictError } from "./CanvasPlacementController";
import type { CanvasPlacementResult } from "./CanvasPlacementController";
import { ResultActions, type ResultActionContext, type ResultActionType } from "./ResultActions";

export type ResultGroupItem = {
  assetId: string;
  label: string;
  resultId: string;
};

type ResultDispatchInput = ResultActionContext & {
  resultId: string;
};

type PlaceDispatchInput = ResultDispatchInput & {
  expectedGraphRevision: number;
};

function requireStableId(value: string, field: string): string {
  const stableId = normalizeStableId(value);
  if (!stableId) throw new Error(`Invalid ${field}`);
  return stableId;
}

function requireGraphRevision(value: number): number {
  if (!Number.isInteger(value) || value < 0) throw new Error("Invalid graph revision");
  return value;
}

export class ResultGroupController {
  private readonly itemsByResultId: ReadonlyMap<string, ResultGroupItem>;
  private selectedResultId: string | null = null;

  constructor(
    items: readonly ResultGroupItem[],
    private readonly actions: ResultActions,
    private readonly placement?: CanvasPlacementController,
  ) {
    const normalized = items.map((item) => ({
      assetId: requireStableId(item.assetId, "assetId"),
      label: item.label,
      resultId: requireStableId(item.resultId, "resultId"),
    }));
    this.itemsByResultId = new Map(normalized.map((item) => [item.resultId, item]));
  }

  getItems(): readonly ResultGroupItem[] {
    return [...this.itemsByResultId.values()];
  }

  getSelectedResultId(): string | null {
    return this.selectedResultId;
  }

  async dispatch(type: ResultActionType, input: ResultDispatchInput): Promise<void>;
  async dispatch(type: "place_on_canvas", input: PlaceDispatchInput): Promise<CanvasPlacementResult>;
  async dispatch(type: ResultActionType | "place_on_canvas", input: ResultDispatchInput | PlaceDispatchInput): Promise<void | CanvasPlacementResult> {
    const resultId = requireStableId(input.resultId, "resultId");
    const item = this.itemsByResultId.get(resultId);
    if (!item) throw new Error("Unknown resultId");

    const common = {
      assetId: item.assetId,
      graphRevision: requireGraphRevision(input.graphRevision),
      resultId,
      sessionId: requireStableId(input.sessionId, "sessionId"),
      turnId: requireStableId(input.turnId, "turnId"),
    };

    if (type === "place_on_canvas") {
      if (!this.placement) throw new Error("Canvas placement is unavailable");
      if (!("expectedGraphRevision" in input)) throw new RevisionConflictError(null);
      return this.placement.place({
        assetId: common.assetId,
        expectedGraphRevision: requireGraphRevision(input.expectedGraphRevision),
        resultId: common.resultId,
        sessionId: common.sessionId,
        turnId: common.turnId,
      });
    }

    if (type === "select") this.selectedResultId = resultId;
    await this.actions.dispatch(type, common);
  }
}
