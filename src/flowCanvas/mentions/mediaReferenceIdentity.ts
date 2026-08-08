export type MediaReferenceKind = "text" | "image" | "video" | "audio";

export type MediaReferenceSeed = {
  inputKey: string;
  kind: MediaReferenceKind;
  [key: string]: unknown;
};

export type MediaReferenceIdentity<T extends MediaReferenceSeed = MediaReferenceSeed> = T & {
  kindIndex: number;
  mentionLabel: string;
};

export function getMediaMentionLabel(kind: MediaReferenceKind, kindIndex: number): string {
  if (kind === "image") return `图片${kindIndex}`;
  if (kind === "video") return `视频${kindIndex}`;
  if (kind === "audio") return `音频${kindIndex}`;
  return "";
}

/**
 * Projects media candidates into stable, type-local ordinals. Text inputs are
 * intentionally excluded because they are not addressable by media mentions.
 */
export function indexMediaReferenceIdentities<T extends MediaReferenceSeed>(
  seeds: readonly T[],
): Array<MediaReferenceIdentity<T>> {
  const counters: Record<Exclude<MediaReferenceKind, "text">, number> = {
    image: 0,
    video: 0,
    audio: 0,
  };

  return seeds
    .filter((seed) => seed.kind !== "text")
    .map((seed) => {
      const kind = seed.kind as Exclude<MediaReferenceKind, "text">;
      const kindIndex = counters[kind] + 1;
      counters[kind] = kindIndex;
      return {
        ...seed,
        kindIndex,
        mentionLabel: getMediaMentionLabel(kind, kindIndex),
      };
    });
}
