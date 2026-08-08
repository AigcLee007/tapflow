import type { FlowMediaMentionKind } from "../types";
import type { VideoGenerationCapabilities, VideoGenerationMode } from "../video/videoTypes";

export type VideoMentionCapabilityState = "loading" | "ready" | "unavailable";

export type VideoMentionCapabilities = {
  allowedKinds: ReadonlySet<FlowMediaMentionKind>;
  disabledReason?: string;
  disabledReasons: ReadonlyMap<FlowMediaMentionKind, string>;
  state: VideoMentionCapabilityState;
};

const MEDIA_KINDS: readonly FlowMediaMentionKind[] = ["image", "video", "audio"];
const LOADING_REASON = "模型能力加载中";
const UNAVAILABLE_REASON = "当前模型未配置媒体输入能力";

function allKindsDisabled(reason: string): VideoMentionCapabilities {
  return {
    allowedKinds: new Set(),
    disabledReason: reason,
    disabledReasons: new Map(MEDIA_KINDS.map((kind) => [kind, reason])),
    state: reason === LOADING_REASON ? "loading" : "unavailable",
  };
}

export function resolveVideoMentionAllowedKinds(input: {
  capabilities: VideoGenerationCapabilities | null | undefined;
  mode: VideoGenerationMode;
  catalogState: "loading" | "ready" | "error";
}): VideoMentionCapabilities {
  if (input.catalogState === "loading") return allKindsDisabled(LOADING_REASON);
  if (input.catalogState !== "ready" || !input.capabilities) return allKindsDisabled(UNAVAILABLE_REASON);
  const constraint = input.capabilities.modeConstraints?.[input.mode];
  const limit = (name: "maxImages" | "maxVideos" | "maxAudios") => {
    const value = constraint?.[name] ?? input.capabilities?.[name];
    return typeof value === "number" ? value : null;
  };
  const allowedKinds = new Set<FlowMediaMentionKind>();
  if ((limit("maxImages") ?? 0) > 0) allowedKinds.add("image");
  if ((limit("maxVideos") ?? 0) > 0) allowedKinds.add("video");
  if ((limit("maxAudios") ?? 0) > 0) allowedKinds.add("audio");
  const disabledReasons = new Map<FlowMediaMentionKind, string>();
  for (const kind of MEDIA_KINDS) {
    if (!allowedKinds.has(kind)) disabledReasons.set(kind, `当前模式不支持${kind === "image" ? "图片" : kind === "video" ? "视频" : "音频"}输入`);
  }
  return { allowedKinds, disabledReasons, state: "ready" };
}
