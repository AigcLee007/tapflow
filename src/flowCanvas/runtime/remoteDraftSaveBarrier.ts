type SaveBarrier = () => Promise<void>;

let currentBarrier: SaveBarrier | null = null;

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
}
