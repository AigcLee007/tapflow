type SaveBarrier = () => Promise<void>;

let currentBarrier: SaveBarrier | null = null;
let lastSuccessfulFlushAt = 0;
let pauseDepth = 0;

export function registerRemoteDraftSaveBarrier(barrier: SaveBarrier | null): () => void {
  currentBarrier = barrier;
  return () => {
    if (currentBarrier === barrier) {
      currentBarrier = null;
    }
  };
}

export async function flushRemoteDraftBeforeRun(): Promise<void> {
  if (pauseDepth > 0) return;
  if (!currentBarrier) {
    return;
  }
  await currentBarrier();
  lastSuccessfulFlushAt = Date.now();
}

export function pauseRemoteDraftAutosave(): () => void {
  pauseDepth += 1;
  let resumed = false;
  return () => {
    if (resumed) return;
    resumed = true;
    pauseDepth = Math.max(0, pauseDepth - 1);
  };
}

export function isRemoteDraftAutosavePaused(): boolean {
  return pauseDepth > 0;
}

export function shouldFlushRemoteDraftBeforeRun(input: {
  isTargetNodeRun: boolean;
  now?: number;
}): boolean {
  if (!input.isTargetNodeRun) {
    return true;
  }
  if (!currentBarrier) {
    return false;
  }
  const now = input.now ?? Date.now();
  return lastSuccessfulFlushAt <= 0 || now - lastSuccessfulFlushAt > 1_500;
}

export function resetRemoteDraftSaveBarrierStateForTests(): void {
  currentBarrier = null;
  lastSuccessfulFlushAt = 0;
  pauseDepth = 0;
}
