const PRODUCTION_IMAGE_MODE_INSTRUCTIONS: Record<string, string> = {
  panorama_360:
    [
      "Production mode: create a 360-degree equirectangular panorama of the scene with seamless left-right continuity, consistent horizon, and no cropped single-camera framing.",
      "Output must be a 2:1 equirectangular unwrap unless an explicit panorama aspect ratio says otherwise; the left edge and right edge must connect as the same physical direction with no visible break.",
      "Do not create a flat wide-angle image, cinematic crop, ordinary 21:9 still, or single-camera perspective. Treat the input as a visual/style anchor for a full environment around one fixed camera point.",
      "Preserve the recognizable scene identity, materials, lighting, horizon height, and spatial continuity from the prompt and references. Avoid duplicated unique fixtures at the seam.",
    ].join(" "),
  subject_orbit_270:
    "Production mode: create a 270-degree three-panel subject orbit sheet showing the same subject across front, three-quarter, and side/back views with consistent identity, scale, lighting, and materials; this is a wraparound/unfolded view sheet, not a single 270-degree camera angle.",
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
