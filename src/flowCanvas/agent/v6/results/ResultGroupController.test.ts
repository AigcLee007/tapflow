import { describe, expect, it, vi } from "vitest";

import {
  ResultGroupController,
  type ResultGroupItem,
} from "./ResultGroupController";
import {
  ResultActions,
  type ResultActionPort,
} from "./ResultActions";
import {
  CanvasPlacementController,
  RevisionConflictError,
  type CanvasPlacementPort,
} from "./CanvasPlacementController";

const context = {
  sessionId: "session-1",
  turnId: "turn-1",
  graphRevision: 7,
};

const item: ResultGroupItem = {
  resultId: "result-1",
  assetId: "asset-1",
  label: "首页方案",
};

function createActions() {
  const port: ResultActionPort = {
    select: vi.fn(async () => undefined),
    preview: vi.fn(async () => undefined),
    refine: vi.fn(async () => undefined),
    variant: vi.fn(async () => undefined),
    setReference: vi.fn(async () => undefined),
  };
  return { actions: new ResultActions(port), port };
}

describe("ResultGroupController", () => {
  it("dispatches each supported action with only stable result references", async () => {
    const { actions, port } = createActions();
    const controller = new ResultGroupController([item], actions);

    await controller.dispatch("select", { ...context, resultId: item.resultId });
    await controller.dispatch("preview", { ...context, resultId: item.resultId });
    await controller.dispatch("refine", { ...context, resultId: item.resultId });
    await controller.dispatch("variant", { ...context, resultId: item.resultId });
    await controller.dispatch("set_reference", { ...context, resultId: item.resultId });

    expect(port.select).toHaveBeenCalledWith({ ...context, resultId: item.resultId, assetId: item.assetId });
    expect(port.preview).toHaveBeenCalledWith({ ...context, resultId: item.resultId, assetId: item.assetId });
    expect(port.refine).toHaveBeenCalledWith({ ...context, resultId: item.resultId, assetId: item.assetId });
    expect(port.variant).toHaveBeenCalledWith({ ...context, resultId: item.resultId, assetId: item.assetId });
    expect(port.setReference).toHaveBeenCalledWith({ ...context, resultId: item.resultId, assetId: item.assetId });
  });

  it("tracks selection without changing the stable result item", async () => {
    const { actions } = createActions();
    const controller = new ResultGroupController([item], actions);

    expect(controller.getSelectedResultId()).toBeNull();
    await controller.dispatch("select", { ...context, resultId: item.resultId });

    expect(controller.getSelectedResultId()).toBe(item.resultId);
    expect(controller.getItems()).toEqual([item]);
  });

  it("requires an expected graph revision before placing a result", async () => {
    const place = vi.fn(async () => ({ graphRevision: 8 }));
    const placementPort: CanvasPlacementPort = { place };
    const placement = new CanvasPlacementController(placementPort);
    const { actions } = createActions();
    const controller = new ResultGroupController([item], actions, placement);

    await expect(controller.dispatch("place_on_canvas", { ...context, resultId: item.resultId } as never))
      .rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
    expect(place).not.toHaveBeenCalled();

    await controller.dispatch("place_on_canvas", {
      ...context,
      resultId: item.resultId,
      expectedGraphRevision: 7,
    });
    expect(place).toHaveBeenCalledWith({
      assetId: item.assetId,
      resultId: item.resultId,
      sessionId: context.sessionId,
      turnId: context.turnId,
      expectedGraphRevision: 7,
    });
  });

  it("normalizes a canvas revision conflict to a recognizable error", async () => {
    const placement = new CanvasPlacementController({
      place: vi.fn(async () => {
        throw Object.assign(new Error("stale canvas"), {
          code: "REVISION_CONFLICT",
          status: 409,
        });
      }),
    });

    await expect(placement.place({
      assetId: item.assetId,
      resultId: item.resultId,
      sessionId: context.sessionId,
      turnId: context.turnId,
      expectedGraphRevision: context.graphRevision,
    })).rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });

    const conflict = new RevisionConflictError(7, 8);
    expect(conflict.status).toBe(409);
    expect(conflict.code).toBe("REVISION_CONFLICT");
  });
});
