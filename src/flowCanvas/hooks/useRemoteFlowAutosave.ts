import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { V2HttpError } from "../../services/v2HttpClient";
import {
  getFlowDraft,
  saveFlowDraft,
  type FlowDraft,
  type FlowDraftGraph,
} from "../services/flowProjectApi";
import { writeLocalFlowDraft } from "../services/localFlowDraft";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import { canonicalizeGraph, hashGraph } from "../utils/canonicalGraph";
import { isRemoteDraftAutosavePaused } from "../runtime/remoteDraftSaveBarrier";

export type RemoteFlowSaveStatus =
  | "idle"
  | "dirty"
  | "syncing"
  | "saved"
  | "retrying"
  | "pending_sync"
  | "failed";

type RemoteFlowAutosaveState = {
  error: string | null;
  saveNow: () => Promise<void>;
  status: RemoteFlowSaveStatus;
  updatedAt: string | null;
};

type FlushSaveOptions = {
  backgroundFollowUp?: boolean;
  recurseAfterInFlight?: boolean;
};

const AUTOSAVE_DELAY_MS = 1200;
const CONFLICT_RETRY_DELAYS_MS = [150, 300];
const FAILED_SYNC_RETRY_MS = 5000;

export function useRemoteFlowAutosave(input: {
  draft: FlowDraft | null;
  enabled: boolean;
  flowId: string | null;
}): RemoteFlowAutosaveState {
  const nodes = useFlowCanvasStore((state) => state.nodes);
  const edges = useFlowCanvasStore((state) => state.edges);
  const projectStudios = useFlowCanvasStore((state) => state.projectStudios);
  const viewport = useFlowCanvasStore((state) => state.viewport);
  const isNodeDragging = useFlowCanvasStore((state) => state.isNodeDragging);
  const markDirty = useFlowCanvasStore((state) => state.markDirty);
  const markClean = useFlowCanvasStore((state) => state.markClean);
  const [status, setStatus] = useState<RemoteFlowSaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(input.draft?.updatedAt ?? null);
  const revisionRef = useRef<number | null>(input.draft?.revision ?? null);
  const cloudSyncedGraphKeyRef = useRef<string | null>(input.draft ? hashGraph(input.draft.graph) : null);
  const localSavedGraphKeyRef = useRef<string | null>(input.draft ? hashGraph(input.draft.graph) : null);
  const latestGraphRef = useRef<FlowDraftGraph>(
    input.draft?.graph ?? { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
  );
  const latestGraphKeyRef = useRef<string>(input.draft ? hashGraph(input.draft.graph) : "");
  const localVersionRef = useRef(0);
  const inFlightRef = useRef(false);
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);
  const inFlightResolveRef = useRef<(() => void) | null>(null);
  const dirtyAgainRef = useRef(false);
  const retryingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);

  const graph = useMemo<FlowDraftGraph>(
    () => canonicalizeGraph({
      edges: edges as unknown as Record<string, unknown>[],
      nodes: nodes as unknown as Record<string, unknown>[],
      ...(projectStudios.director3d ? { projectStudios } : {}),
      viewport,
    }),
    [edges, nodes, projectStudios, viewport],
  );

  const graphKey = useMemo(() => hashGraph(graph), [graph]);

  useEffect(() => {
    latestGraphRef.current = graph;
    latestGraphKeyRef.current = graphKey;
  }, [graph, graphKey]);

  const clearScheduledSave = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const waitForRetryDelay = useCallback((delayMs: number) => {
    return new Promise<void>((resolve) => {
      window.setTimeout(resolve, delayMs);
    });
  }, []);

  const syncLatestGraphFromStore = useCallback(() => {
    const state = useFlowCanvasStore.getState();
    const latestGraph = canonicalizeGraph({
      edges: state.edges as unknown as Record<string, unknown>[],
      nodes: state.nodes as unknown as Record<string, unknown>[],
      ...(state.projectStudios.director3d ? { projectStudios: state.projectStudios } : {}),
      viewport: state.viewport,
    });
    latestGraphRef.current = latestGraph;
    latestGraphKeyRef.current = hashGraph(latestGraph);
    return latestGraph;
  }, []);

  const flushSaveQueue = useCallback(
    async (
      mode: "syncing" | "retrying" = "syncing",
      options: FlushSaveOptions = {},
    ): Promise<void> => {
      if (!input.enabled || !input.flowId || !input.draft) {
        return;
      }
      if (isRemoteDraftAutosavePaused()) {
        dirtyAgainRef.current = true;
        return;
      }
      syncLatestGraphFromStore();
      if (inFlightRef.current) {
        dirtyAgainRef.current = true;
        await inFlightPromiseRef.current;
        if (options.recurseAfterInFlight === false) {
          return;
        }
        return flushSaveQueue(mode);
      }

      const currentGraphKey = latestGraphKeyRef.current;
      if (currentGraphKey === cloudSyncedGraphKeyRef.current) {
        setStatus((currentStatus) => (currentStatus === "saved" ? currentStatus : "saved"));
        return;
      }

      clearScheduledSave();
      inFlightRef.current = true;
      inFlightPromiseRef.current = new Promise<void>((resolve) => {
        inFlightResolveRef.current = resolve;
      });
      dirtyAgainRef.current = false;
      retryingRef.current = mode === "retrying";
      setStatus(mode === "retrying" ? "retrying" : "syncing");
      setError(null);

      let saveSucceeded = false;
      let savedGraphKey = latestGraphKeyRef.current;

      try {
        let nextDraft: FlowDraft | null = null;

        for (let attempt = 0; attempt <= CONFLICT_RETRY_DELAYS_MS.length; attempt += 1) {
          try {
            savedGraphKey = latestGraphKeyRef.current;
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
          throw new Error("自动保存多次重试后仍未拿到已保存的草稿。");
        }

        revisionRef.current = nextDraft.revision;
        cloudSyncedGraphKeyRef.current = savedGraphKey;
        setUpdatedAt(nextDraft.updatedAt);
        setError(null);

        const hasPendingChanges =
          dirtyAgainRef.current || latestGraphKeyRef.current !== cloudSyncedGraphKeyRef.current;

        if (hasPendingChanges) {
          markDirty();
          setStatus("pending_sync");
        } else {
          markClean();
          setStatus("saved");
        }
        saveSucceeded = true;
      } catch (saveError) {
        setStatus("failed");
        setError(getAutosaveErrorMessage(saveError));
        if (retryTimerRef.current === null) {
          retryTimerRef.current = window.setTimeout(() => {
            retryTimerRef.current = null;
            if (
              input.enabled &&
              input.flowId &&
              input.draft &&
              latestGraphKeyRef.current !== cloudSyncedGraphKeyRef.current
            ) {
              void flushSaveQueue("syncing");
            }
          }, FAILED_SYNC_RETRY_MS);
        }
      } finally {
        inFlightRef.current = false;
        retryingRef.current = false;
        inFlightResolveRef.current?.();
        inFlightResolveRef.current = null;
        inFlightPromiseRef.current = null;

        if (
          saveSucceeded &&
          options.backgroundFollowUp !== false &&
          input.enabled &&
          input.flowId &&
          input.draft &&
          (dirtyAgainRef.current || latestGraphKeyRef.current !== cloudSyncedGraphKeyRef.current)
        ) {
          void flushSaveQueue("syncing");
        }
      }
    },
    [clearScheduledSave, input.draft, input.enabled, input.flowId, markClean, markDirty, syncLatestGraphFromStore, waitForRetryDelay],
  );

  const scheduleSave = useCallback(
    (delayMs: number) => {
      if (!input.enabled || !input.flowId || !input.draft) return;
      if (latestGraphKeyRef.current === cloudSyncedGraphKeyRef.current) return;

      if (inFlightRef.current) {
        dirtyAgainRef.current = true;
        return;
      }

      clearScheduledSave();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void flushSaveQueue(retryingRef.current ? "retrying" : "syncing");
      }, delayMs);
      setStatus((currentStatus) => (currentStatus === "failed" ? "pending_sync" : "dirty"));
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
    cloudSyncedGraphKeyRef.current = input.draft.needsCloudSync ? null : hashGraph(input.draft.graph);
    localSavedGraphKeyRef.current = hashGraph(input.draft.graph);
    latestGraphRef.current = canonicalizeGraph(input.draft.graph);
    latestGraphKeyRef.current = hashGraph(input.draft.graph);
    setUpdatedAt(input.draft.updatedAt);
    setStatus(input.draft.needsCloudSync ? "pending_sync" : "saved");
    setError(null);
  }, [clearScheduledSave, input.draft]);

  const saveNow = async () => {
    syncLatestGraphFromStore();
    dirtyAgainRef.current = true;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await flushSaveQueue(retryingRef.current ? "retrying" : "syncing", {
        backgroundFollowUp: false,
        recurseAfterInFlight: false,
      });
      syncLatestGraphFromStore();
      if (latestGraphKeyRef.current === cloudSyncedGraphKeyRef.current) {
        return;
      }
    }
    await flushSaveQueue(retryingRef.current ? "retrying" : "syncing", {
      backgroundFollowUp: false,
    });
  };

  useEffect(() => {
    if (!input.enabled || !input.flowId || !input.draft || isNodeDragging) return;
    if (localSavedGraphKeyRef.current !== graphKey) {
      const localDraft = writeLocalFlowDraft({
        flowId: input.flowId,
        graph,
        lastServerRevision: revisionRef.current,
        previousLocalVersion: localVersionRef.current,
        tenantId: input.draft.tenantId,
      });
      localVersionRef.current = localDraft?.localVersion ?? localVersionRef.current + 1;
      localSavedGraphKeyRef.current = graphKey;
      setUpdatedAt(localDraft?.updatedAt ?? new Date().toISOString());
      if (cloudSyncedGraphKeyRef.current === graphKey) {
        setStatus("saved");
        setError(null);
      } else if (!inFlightRef.current) {
        setStatus("pending_sync");
      }
    }
    if (cloudSyncedGraphKeyRef.current === graphKey) return;
    scheduleSave(AUTOSAVE_DELAY_MS);
  }, [graph, graphKey, input.draft, input.enabled, input.flowId, isNodeDragging, scheduleSave]);

  useEffect(() => {
    if (!input.enabled || !input.flowId || !input.draft || isNodeDragging) return;
    if (latestGraphKeyRef.current === cloudSyncedGraphKeyRef.current || inFlightRef.current) return;
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
        ? "当前画布仍包含本地图片数据，暂时无法同步到云端。请重新上传素材后再试。"
        : "草稿内容未通过校验，暂时无法同步到云端。";
    }
    if (error.status === 401) {
      return "登录状态已失效，云端同步已暂停，请重新登录。";
    }
    if (error.status === 409) {
      return "检测到草稿版本冲突，系统会继续重试同步，你可以继续编辑。";
    }
    if (error.status >= 500) {
      return "服务暂时不可用，云端同步稍后会自动重试。";
    }
    return error.message || "云端同步暂未完成。";
  }

  if (error instanceof Error && /failed to fetch/i.test(error.message)) {
    return "当前无法连接草稿接口，云端同步已暂停，请检查本地 API 服务或代理。";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "云端同步暂未完成。";
}
