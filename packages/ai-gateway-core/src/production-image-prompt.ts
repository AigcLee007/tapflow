const PRODUCTION_IMAGE_MODE_INSTRUCTIONS: Record<string, string> = {
  panorama_360:
    "Production mode: create a 360-degree equirectangular panorama of the scene with seamless left-right continuity, consistent horizon, and no cropped single-camera framing.",
  subject_orbit_270:
    "Production mode: create a three-panel subject orbit sheet showing the same subject across front, three-quarter, and side/back views with consistent identity, scale, lighting, and materials.",
  wraparound_270:
    "Production mode: create a 270-degree wraparound environment showing three connected sides of the same space as one continuous unfolded view with coherent perspective and matching edges.",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readGenerationMode(metadata: unknown): string {
  const metadataRecord = asRecord(metadata);
  const params = asRecord(metadataRecord.params);
  const direct = typeof metadataRecord.generationMode === "string" ? metadataRecord.generationMode.trim() : "";
  const fromParams = typeof params.generationMode === "string" ? params.generationMode.trim() : "";
  return fromParams || direct;
}

export function buildProductionImagePrompt(prompt: string, metadata: unknown): string {
  const instruction = PRODUCTION_IMAGE_MODE_INSTRUCTIONS[readGenerationMode(metadata)];
  if (!instruction) {
    return prompt;
  }

  return `${prompt.trim()}\n\n${instruction}`;
}
