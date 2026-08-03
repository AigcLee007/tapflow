import type {
  VideoGenerationCapabilities,
  VideoGenerationDiagnostic,
  VideoGenerationMode,
  VideoGenerationParamsV2,
  VideoReferenceInputV2,
} from "./videoTypes";

type ModeResolution = {
  incompatible: boolean;
  mode: VideoGenerationMode;
  references: VideoReferenceInputV2[];
};

export function resolveAutomaticVideoMode(
  capabilities: VideoGenerationCapabilities,
  references: VideoReferenceInputV2[],
  currentMode: VideoGenerationMode,
): ModeResolution {
  const imageCount = references.filter((reference) => reference.mediaKind === "image").length;
  const videoCount = references.filter((reference) => reference.mediaKind === "video").length;
  const audioCount = references.filter((reference) => reference.mediaKind === "audio").length;
  if (videoCount + audioCount > 0) {
    if (capabilities.supportedModes.includes("all_reference")) {
      return result("all_reference", false, references, capabilities);
    }
    return result(currentMode, true, references, capabilities);
  }
  if (imageCount === 0) return result("text_to_video", false, references, capabilities);
  if (imageCount === 1) return result("image_to_video", !capabilities.supportedModes.includes("image_to_video"), references, capabilities);
  if (capabilities.referenceSemantics === "ordered_first_last_frames" && imageCount === 2) {
    return result("first_last_frame", !capabilities.supportedModes.includes("first_last_frame"), references, capabilities);
  }
  if (capabilities.supportedModes.includes("image_reference")) return result("image_reference", false, references, capabilities);
  return result(currentMode, true, references, capabilities);
}

export function normalizeReferenceRolesForMode(
  references: VideoReferenceInputV2[],
  mode: VideoGenerationMode,
  semantics: VideoGenerationCapabilities["referenceSemantics"],
): VideoReferenceInputV2[] {
  const ordered = [...references].sort((left, right) => left.order - right.order);
  let imageIndex = 0;
  return ordered.map((reference, order) => {
    let role = reference.role;
    if (mode === "first_last_frame" && reference.mediaKind === "image") {
      role = imageIndex++ === 0 ? "first_frame" : "last_frame";
    } else if (mode === "image_to_video" && reference.mediaKind === "image") {
      role = semantics === "ordered_first_last_frames" ? "first_frame" : "main_image";
    } else if (mode === "image_reference" && reference.mediaKind === "image") {
      role = "reference_image";
    } else if (mode === "all_reference") {
      role = reference.mediaKind === "image"
        ? "reference_image"
        : reference.mediaKind === "video"
          ? "source_video"
          : "reference_audio";
    }
    return { ...reference, role, order };
  });
}

export function validateVideoReferenceInputs(
  params: VideoGenerationParamsV2,
  capabilities: VideoGenerationCapabilities,
): VideoGenerationDiagnostic[] {
  const issues: VideoGenerationDiagnostic[] = [];
  if (!capabilities.supportedModes.includes(params.mode)) {
    issues.push(diagnostic("UNSUPPORTED_VIDEO_MODE", "mode", "当前模型不支持该生成模式"));
    return issues;
  }
  const references = params.referenceInputs ?? [];
  const counts = {
    audio: references.filter((reference) => reference.mediaKind === "audio").length,
    image: references.filter((reference) => reference.mediaKind === "image").length,
    video: references.filter((reference) => reference.mediaKind === "video").length,
  };
  const constraint = capabilities.modeConstraints?.[params.mode];
  const maxImages = Number(constraint?.maxImages ?? capabilities.maxImages ?? Number.POSITIVE_INFINITY);
  const maxVideos = Number(constraint?.maxVideos ?? capabilities.maxVideos ?? Number.POSITIVE_INFINITY);
  const maxAudios = Number(constraint?.maxAudios ?? capabilities.maxAudios ?? Number.POSITIVE_INFINITY);
  const maxTotal = Number(constraint?.maxTotal ?? capabilities.maxTotal ?? Number.POSITIVE_INFINITY);
  if (counts.image > maxImages || counts.video > maxVideos || counts.audio > maxAudios) {
    issues.push(diagnostic("REFERENCE_LIMIT_EXCEEDED", "referenceInputs", "参考素材数量超过当前模型限制"));
  }
  if (references.length > maxTotal) {
    issues.push(diagnostic("REFERENCE_MEDIA_TOTAL_EXCEEDED", "referenceInputs", "参考素材总数超过当前模型限制"));
  }
  if (constraint?.requiresVideoOrAudio && counts.video + counts.audio === 0) {
    issues.push(diagnostic("VIDEO_MODE_INPUT_REQUIRED", "referenceInputs", "该模式需要视频或音频参考"));
  }
  if (
    (typeof constraint?.minImages === "number" && counts.image < constraint.minImages)
    || (typeof constraint?.minVideos === "number" && counts.video < constraint.minVideos)
    || (typeof constraint?.minAudios === "number" && counts.audio < constraint.minAudios)
  ) {
    addMissingInputIssue(issues);
  }
  if (constraint?.requiresVisualWithAudio && counts.audio > 0 && counts.image + counts.video === 0) {
    issues.push(diagnostic("AUDIO_REFERENCE_REQUIRES_VISUAL", "referenceInputs", "音频参考必须同时有图片或视频"));
  }
  if (capabilities.supportedDurations?.length && !capabilities.supportedDurations.includes(params.durationSeconds)) {
    issues.push(diagnostic("UNSUPPORTED_DURATION", "durationSeconds", "当前模型不支持该视频时长"));
  }
  if (capabilities.audioControlMode === "always_on_implicit" && !params.generateAudio) {
    issues.push(diagnostic("AUDIO_SETTING_FIXED", "generateAudio", "当前模型固定生成音频"));
  }
  if (capabilities.audioControlMode === "unsupported" && params.generateAudio) {
    issues.push(diagnostic("AUDIO_SETTING_FIXED", "generateAudio", "当前模型不支持生成音频"));
  }
  validateReferenceRoles(issues, params.mode, references, capabilities.referenceSemantics);
  return issues;
}

function validateReferenceRoles(
  issues: VideoGenerationDiagnostic[],
  mode: VideoGenerationMode,
  references: VideoReferenceInputV2[],
  semantics: VideoGenerationCapabilities["referenceSemantics"],
): void {
  const images = references.filter((reference) => reference.mediaKind === "image");
  const videos = references.filter((reference) => reference.mediaKind === "video");

  if (mode === "image_to_video") {
    const requiredRole = semantics === "ordered_first_last_frames" ? "first_frame" : "main_image";
    const matchingImages = images.filter((reference) => reference.role === requiredRole);
    if (references.length !== 1 || images.length !== 1 || matchingImages.length !== 1) addMissingInputIssue(issues);
  }

  if (mode === "all_reference" && semantics === "style_images_and_source_video") {
    const sourceVideos = videos.filter((reference) => reference.role === "source_video");
    if (sourceVideos.length !== 1 || videos.some((reference) => reference.role !== "source_video")) addMissingInputIssue(issues);
  }

  if (mode === "first_last_frame" && semantics === "ordered_first_last_frames") {
    const firstFrames = images.filter((reference) => reference.role === "first_frame");
    const lastFrames = images.filter((reference) => reference.role === "last_frame");
    if (
      images.length !== 2
      || firstFrames.length !== 1
      || lastFrames.length !== 1
      || firstFrames[0]!.order >= lastFrames[0]!.order
    ) addMissingInputIssue(issues);
  }
}

function addMissingInputIssue(issues: VideoGenerationDiagnostic[]): void {
  if (issues.some((issue) => issue.code === "VIDEO_MODE_INPUT_REQUIRED")) return;
  issues.push(diagnostic("VIDEO_MODE_INPUT_REQUIRED", "referenceInputs", "当前生成模式需要补充参考素材"));
}

function result(
  mode: VideoGenerationMode,
  incompatible: boolean,
  references: VideoReferenceInputV2[],
  capabilities: VideoGenerationCapabilities,
): ModeResolution {
  return { incompatible, mode, references: normalizeReferenceRolesForMode(references, mode, capabilities.referenceSemantics) };
}

function diagnostic(code: VideoGenerationDiagnostic["code"], field: string, message: string): VideoGenerationDiagnostic {
  return { code, field, message };
}
