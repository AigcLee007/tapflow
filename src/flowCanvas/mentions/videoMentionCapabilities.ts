import type { FlowMediaMentionKind } from "../types";
import type { VideoGenerationCapabilities, VideoGenerationMode } from "../video/videoTypes";

export type VideoMentionCapabilityState = "loading" | "ready" | "unavailable";

export function resolveVideoMentionAllowedKinds(input: {
  capabilities: VideoGenerationCapabilities | null | undefined;
  mode: VideoGenerationMode;
  catalogState: "loading" | "ready" | "error";
}): { allowedKinds: ReadonlySet<FlowMediaMentionKind>; state: VideoMentionCapabilityState } {
  if (input.catalogState === "loading") return { allowedKinds: new Set(), state: "loading" };
  if (input.catalogState !== "ready" || !input.capabilities) return { allowedKinds: new Set(), state: "unavailable" };
  const constraint = input.capabilities.modeConstraints?.[input.mode];
  const limit = (name: "maxImages" | "maxVideos" | "maxAudios") => {
    const value = constraint?.[name] ?? input.capabilities?.[name];
    return typeof value === "number" ? value : null;
  };
  const allowedKinds = new Set<FlowMediaMentionKind>();
  if ((limit("maxImages") ?? 0) > 0) allowedKinds.add("image");
  if ((limit("maxVideos") ?? 0) > 0) allowedKinds.add("video");
  if ((limit("maxAudios") ?? 0) > 0) allowedKinds.add("audio");
  return { allowedKinds, state: "ready" };
}
