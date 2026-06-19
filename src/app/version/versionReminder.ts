export type VersionManifest = {
  builtAt?: string;
  commit?: string;
  version: string;
};

export const APP_VERSION_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function normalizeVersionManifest(input: unknown): VersionManifest | null {
  if (!input || typeof input !== "object") return null;

  const candidate = input as Record<string, unknown>;
  if (typeof candidate.version !== "string" || candidate.version.trim() === "") {
    return null;
  }

  return {
    version: candidate.version.trim(),
    builtAt: typeof candidate.builtAt === "string" ? candidate.builtAt : undefined,
    commit: typeof candidate.commit === "string" ? candidate.commit : undefined,
  };
}

export function hasVersionChanged(currentVersion: string, latestManifest: VersionManifest | null): boolean {
  const current = currentVersion.trim();
  const latest = latestManifest?.version.trim() || "";
  return Boolean(current && latest && current !== latest);
}

export function buildVersionManifestUrl(now = Date.now()): string {
  return `/version.json?t=${encodeURIComponent(String(now))}`;
}
