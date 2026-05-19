import { useEffect, useMemo, useRef, useState } from "react";

import { V2HttpError } from "../../services/v2HttpClient";
import { saveFlowDraft, type FlowDraft, type FlowDraftGraph } from "../services/flowProjectApi";
import { useFlowCanvasStore } from "../store/flowCanvasStore";

export type RemoteFlowSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

type RemoteFlowAutosaveState = {
  error: string | null;
  saveNow: () => void;
  status: RemoteFlowSaveStatus;
  updatedAt: string | null;
};

const AUTOSAVE_DELAY_MS = 1200;

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
  const markClean = useFlowCanvasStore((state) => state.markClean);
  const [status, setStatus] = useState<RemoteFlowSaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(input.draft?.updatedAt ?? null);
  const revisionRef = useRef<number | null>(input.draft?.revision ?? null);
  const syncedGraphKeyRef = useRef<string | null>(input.draft ? toGraphKey(input.draft.graph) : null);
  const [saveTick, setSaveTick] = useState(0);

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
    if (!input.draft) return;
    revisionRef.current = input.draft.revision;
    syncedGraphKeyRef.current = toGraphKey(input.draft.graph);
    setUpdatedAt(input.draft.updatedAt);
    setStatus("idle");
    setError(null);
  }, [input.draft]);

  const saveNow = () => {
    setSaveTick((tick) => tick + 1);
    setStatus("dirty");
  };

  useEffect(() => {
    if (!input.enabled || !input.flowId || !input.draft) return;
    if (isNodeDragging) return;
    if (syncedGraphKeyRef.current === graphKey && saveTick === 0) return;

    setStatus("dirty");
    setError(null);

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setStatus("saving");
      void saveFlowDraft(input.flowId!, {
        expectedRevision: revisionRef.current ?? undefined,
        graph,
      })
        .then((nextDraft) => {
          if (cancelled) return;
          revisionRef.current = nextDraft.revision;
          syncedGraphKeyRef.current = toGraphKey(nextDraft.graph);
          setSaveTick(0);
          setUpdatedAt(nextDraft.updatedAt);
          setStatus("saved");
          setError(null);
          markClean();
        })
        .catch((saveError) => {
          if (cancelled) return;
          setStatus("error");
          setError(getAutosaveErrorMessage(saveError));
        });
    }, AUTOSAVE_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    graph,
    graphKey,
    input.draft,
    input.enabled,
    input.flowId,
    isNodeDragging,
    markClean,
    saveTick,
  ]);

  return {
    error,
    saveNow,
    status,
    updatedAt,
  };
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
      return "Save failed because this canvas was updated elsewhere. Refresh before continuing.";
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
