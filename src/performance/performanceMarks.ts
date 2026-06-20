export function markNow(name: string): void {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  performance.mark(name);
}

export function markMeasure(name: string, start: string, end: string): void {
  if (typeof performance === "undefined" || typeof performance.measure !== "function") return;
  try {
    performance.measure(name, start, end);
  } catch {
    // Performance marks are diagnostics only.
  }
}

export function clearPerformanceMeasure(name: string): void {
  if (typeof performance === "undefined" || typeof performance.clearMeasures !== "function") return;
  performance.clearMeasures(name);
}
