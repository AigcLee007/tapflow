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

  const graph = useMemo<FlowDraftGraph>(() => ({
    edges: edges as unknown as Record<string, unknown>[],
    nodes: nodes as unknown as Record<string, unknown>[],
    viewport,
  }), [edges, nodes, viewport]);

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
          const conflictMessage =
            saveError instanceof V2HttpError && saveError.status === 409
              ? "画布已在其他位置更新，请刷新后再继续编辑。"
              : saveError instanceof Error
                ? saveError.message
                : "远程草稿保存失败";
          setStatus("error");
          setError(conflictMessage);
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
