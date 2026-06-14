type SaveBarrier = () => Promise<void>;

let currentBarrier: SaveBarrier | null = null;
let lastSuccessfulFlushAt = 0;

export function registerRemoteDraftSaveBarrier(barrier: SaveBarrier | null): () => void {
  currentBarrier = barrier;
  return () => {
    if (currentBarrier === barrier) {
      currentBarrier = null;
    }
  };
}

export async function flushRemoteDraftBeforeRun(): Promise<void> {
  if (!currentBarrier) {
    return;
  }
  await currentBarrier();
  lastSuccessfulFlushAt = Date.now();
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
}
