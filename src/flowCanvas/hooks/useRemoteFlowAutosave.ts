import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { V2HttpError } from "../../services/v2HttpClient";
import {
  getFlowDraft,
  saveFlowDraft,
  type FlowDraft,
  type FlowDraftGraph,
} from "../services/flowProjectApi";
import { useFlowCanvasStore } from "../store/flowCanvasStore";

export type RemoteFlowSaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "retrying"
  | "failed";

type RemoteFlowAutosaveState = {
  error: string | null;
  saveNow: () => void;
  status: RemoteFlowSaveStatus;
  updatedAt: string | null;
};

const AUTOSAVE_DELAY_MS = 1200;
const CONFLICT_RETRY_DELAYS_MS = [150, 300];

function toGraphKey(graph: FlowDraftGraph): string {
  try {
    return JSON.stringify(graph);
  } catch {
    return `${Date.now()}`;
  }
}

export function useRemoteFlowAutosave(input: {
  draft: FlowDraft | null;
  enabled: boolean;
  flowId: string | null;
}): RemoteFlowAutosaveState {
  const nodes = useFlowCanvasStore((state) => state.nodes);
  const edges = useFlowCanvasStore((state) => state.edges);
  const viewport = useFlowCanvasStore((state) => state.viewport);
  const isNodeDragging = useFlowCanvasStore((state) => state.isNodeDragging);
  const markDirty = useFlowCanvasStore((state) => state.markDirty);
  const markClean = useFlowCanvasStore((state) => state.markClean);
  const [status, setStatus] = useState<RemoteFlowSaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(input.draft?.updatedAt ?? null);
  const revisionRef = useRef<number | null>(input.draft?.revision ?? null);
  const syncedGraphKeyRef = useRef<string | null>(input.draft ? toGraphKey(input.draft.graph) : null);
  const latestGraphRef = useRef<FlowDraftGraph>(input.draft?.graph ?? { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
  const latestGraphKeyRef = useRef<string>(input.draft ? toGraphKey(input.draft.graph) : "");
  const inFlightRef = useRef(false);
  const dirtyAgainRef = useRef(false);
  const retryingRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const graph = useMemo<FlowDraftGraph>(
    () => ({
      edges: edges as unknown as Record<string, unknown>[],
      nodes: nodes as unknown as Record<string, unknown>[],
      viewport,
    }),
    [edges, nodes, viewport],
  );

  const graphKey = useMemo(() => toGraphKey(graph), [graph]);

  useEffect(() => {
    latestGraphRef.current = graph;
    latestGraphKeyRef.current = graphKey;
  }, [graph, graphKey]);

  const clearScheduledSave = useCallback(() => {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const waitForRetryDelay = useCallback((delayMs: number) => {
    return new Promise<void>((resolve) => {
      window.setTimeout(resolve, delayMs);
    });
  }, []);

  const flushSaveQueue = useCallback(
    async (mode: "saving" | "retrying" = "saving"): Promise<void> => {
      if (!input.enabled || !input.flowId || !input.draft || inFlightRef.current) {
        return;
      }

      const currentGraphKey = latestGraphKeyRef.current;
      if (currentGraphKey === syncedGraphKeyRef.current) {
        setStatus((currentStatus) => (currentStatus === "saved" ? currentStatus : "saved"));
        return;
      }

      clearScheduledSave();
      inFlightRef.current = true;
      dirtyAgainRef.current = false;
      retryingRef.current = mode === "retrying";
      setStatus(mode);
      setError(null);

      let saveSucceeded = false;

      try {
        let nextDraft: FlowDraft | null = null;

        for (let attempt = 0; attempt <= CONFLICT_RETRY_DELAYS_MS.length; attempt += 1) {
          try {
            nextDraft = await saveFlowDraft(input.flowId, {
              expectedRevision: revisionRef.current ?? undefined,
              graph: latestGraphRef.current,
            });
            break;
          } catch (saveError) {
            if (!isRevisionConflict(saveError)) {
              throw saveError;
            }

            const latestDraft = await getFlowDraft(input.flowId);
            revisionRef.current = latestDraft.revision;
            setUpdatedAt(latestDraft.updatedAt);

            if (attempt >= CONFLICT_RETRY_DELAYS_MS.length) {
              throw saveError;
            }

            setStatus("retrying");
            await waitForRetryDelay(CONFLICT_RETRY_DELAYS_MS[attempt] ?? 150);
          }
        }

        if (!nextDraft) {
          throw new Error("Autosave retry exhausted before receiving a saved draft.");
        }

        revisionRef.current = nextDraft.revision;
        syncedGraphKeyRef.current = toGraphKey(nextDraft.graph);
        setUpdatedAt(nextDraft.updatedAt);
        setError(null);

        const hasPendingChanges =
          dirtyAgainRef.current || latestGraphKeyRef.current !== syncedGraphKeyRef.current;

        if (hasPendingChanges) {
          markDirty();
          setStatus("dirty");
        } else {
          markClean();
          setStatus("saved");
        }
        saveSucceeded = true;
      } catch (saveError) {
        setStatus("failed");
        setError(getAutosaveErrorMessage(saveError));
      } finally {
        inFlightRef.current = false;
        retryingRef.current = false;

        if (
          saveSucceeded &&
          input.enabled &&
          input.flowId &&
          input.draft &&
          (dirtyAgainRef.current || latestGraphKeyRef.current !== syncedGraphKeyRef.current)
        ) {
          void flushSaveQueue("saving");
        }
      }
    },
    [clearScheduledSave, input.draft, input.enabled, input.flowId, markClean, markDirty, waitForRetryDelay],
  );

  const scheduleSave = useCallback(
    (delayMs: number) => {
      if (!input.enabled || !input.flowId || !input.draft) return;
      if (latestGraphKeyRef.current === syncedGraphKeyRef.current) return;

      if (inFlightRef.current) {
        dirtyAgainRef.current = true;
        return;
      }

      clearScheduledSave();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void flushSaveQueue(retryingRef.current ? "retrying" : "saving");
      }, delayMs);
      setStatus("dirty");
      setError(null);
    },
    [clearScheduledSave, flushSaveQueue, input.draft, input.enabled, input.flowId],
  );

  useEffect(() => {
    if (!input.draft) return;
    clearScheduledSave();
    inFlightRef.current = false;
    dirtyAgainRef.current = false;
    retryingRef.current = false;
    revisionRef.current = input.draft.revision;
    syncedGraphKeyRef.current = toGraphKey(input.draft.graph);
    latestGraphRef.current = input.draft.graph;
    latestGraphKeyRef.current = toGraphKey(input.draft.graph);
    setUpdatedAt(input.draft.updatedAt);
    setStatus("saved");
    setError(null);
  }, [clearScheduledSave, input.draft]);

  const saveNow = () => {
    dirtyAgainRef.current = true;
    scheduleSave(0);
  };

  useEffect(() => {
    if (!input.enabled || !input.flowId || !input.draft || isNodeDragging) return;
    if (syncedGraphKeyRef.current === graphKey) return;
    scheduleSave(AUTOSAVE_DELAY_MS);
  }, [graphKey, input.draft, input.enabled, input.flowId, isNodeDragging, scheduleSave]);

  useEffect(() => {
    if (!input.enabled || !input.flowId || !input.draft || isNodeDragging) return;
    if (latestGraphKeyRef.current === syncedGraphKeyRef.current || inFlightRef.current) return;
    scheduleSave(AUTOSAVE_DELAY_MS);
  }, [input.draft, input.enabled, input.flowId, isNodeDragging, scheduleSave]);

  useEffect(
    () => () => {
      clearScheduledSave();
    },
    [clearScheduledSave],
  );

  return {
    error,
    saveNow,
    status,
    updatedAt,
  };
}

function isRevisionConflict(error: unknown) {
  return error instanceof V2HttpError && error.status === 409;
}

function getAutosaveErrorMessage(error: unknown) {
  if (error instanceof V2HttpError) {
    if (error.status === 400) {
      return error.code === "UNSUPPORTED_LOCAL_PAYLOAD"
        ? "Save failed because the canvas still contains local-only image data. Please re-upload the asset and try again."
        : "Save failed because the draft payload did not pass validation.";
    }
    if (error.status === 401) {
      return "Save failed because your session expired. Please log in again.";
    }
    if (error.status === 409) {
      return "Save failed because autosave could not claim the latest revision yet. Editing can continue.";
    }
    if (error.status >= 500) {
      return "Save failed because the server is temporarily unavailable.";
    }
    return error.message || "Remote draft save failed.";
  }

  if (error instanceof Error && /failed to fetch/i.test(error.message)) {
    return "Save failed because the app could not reach the draft API. Check the local API server or proxy.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Remote draft save failed.";
}
