export type LandingChapterId = "imagination" | "rewrite" | "form" | "resolution";
export type LandingFilmVariantId = "a" | "b" | "c";
export type LandingFilmKind = "poster" | "video";
export type LandingFilmOrientation = "desktop" | "mobile";

export type LandingFilmChapter = {
  id: LandingChapterId;
  label: string;
  title: string;
  description: string;
  variants: { id: LandingFilmVariantId }[];
};

export const LANDING_FILM_MANIFEST: LandingFilmChapter[] = [
  { id: "imagination", label: "想象", title: "让想象先抵达", description: "把还未命名的画面，变成开始。", variants: [{ id: "a" }, { id: "b" }, { id: "c" }] },
  { id: "rewrite", label: "重写", title: "让每一次改变有迹可循", description: "重新组织灵感，而不是从头开始。", variants: [{ id: "a" }, { id: "b" }, { id: "c" }] },
  { id: "form", label: "成形", title: "让构想成为作品", description: "从一个念头，到可继续推进的结果。", variants: [{ id: "a" }, { id: "b" }, { id: "c" }] },
  { id: "resolution", label: "抵达", title: "让创作持续向前", description: "回到工作区，继续下一步。", variants: [{ id: "a" }, { id: "b" }, { id: "c" }] },
];

export const getLandingMediaBaseUrl = (baseUrl = import.meta.env.VITE_LANDING_MEDIA_BASE_URL || "/landing-films/v1") =>
  `${baseUrl.replace(/\/+$/, "")}/`;

export const getLandingFilmUrl = (
  chapter: LandingChapterId,
  variant: LandingFilmVariantId,
  kind: LandingFilmKind,
  baseUrl?: string,
  orientation: LandingFilmOrientation = "desktop",
) => `${getLandingMediaBaseUrl(baseUrl)}gemini-omni-flash/${chapter}/variant-${variant}/${orientation}/${kind}.${kind === "poster" ? "webp" : "mp4"}`;
