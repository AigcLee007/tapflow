import type { VideoReferenceRole } from "./videoTypes";
import { VIDEO_UI_REFERENCE_ROLE_COPY } from "./videoUiCopy";

export const VIDEO_CONTEXT_COLOR_PRESETS = [
  { token: "洋红", hex: "#E916D7" },
  { token: "湖蓝", hex: "#16D8E6" },
  { token: "柠檬黄", hex: "#D8F20B" },
  { token: "橙红", hex: "#FF6A0B" },
  { token: "紫罗兰", hex: "#7C4DEB" },
  { token: "翠绿", hex: "#12E874" },
  { token: "天蓝", hex: "#159BF2" },
  { token: "金黄", hex: "#FFC519" },
  { token: "葡萄紫", hex: "#9A08E9" },
  { token: "青绿", hex: "#0FE0BC" },
  { token: "草绿", hex: "#37E528" },
  { token: "靛蓝", hex: "#556ED8" },
] as const;

export const VIDEO_CONTEXT_PALETTE_GROUPS: ReadonlyArray<{
  roles: readonly VideoReferenceRole[];
  title: string;
}> = [
  { roles: ["subject"], title: `${VIDEO_UI_REFERENCE_ROLE_COPY.subject}颜色` },
  { roles: ["scene"], title: `${VIDEO_UI_REFERENCE_ROLE_COPY.scene}颜色` },
  { roles: ["prop"], title: `${VIDEO_UI_REFERENCE_ROLE_COPY.prop}颜色` },
  { roles: ["style"], title: `${VIDEO_UI_REFERENCE_ROLE_COPY.style}颜色` },
];

export const VIDEO_VISUAL_TONE_PRESETS = [
  { value: "neutral", label: "自然", strips: ["#D7D3C9", "#8A9A8E", "#4D5C61"] },
  { value: "cinematic_teal", label: "青橙电影", strips: ["#1F6D78", "#102F3E", "#F08B38"] },
  { value: "warm_sunset", label: "暖色夕阳", strips: ["#E2673D", "#F1B364", "#673742"] },
  { value: "cool_moonlight", label: "冷调月光", strips: ["#B2D5E9", "#55789B", "#27364F"] },
  { value: "monochrome", label: "黑白", strips: ["#F2F2F2", "#8B8B8B", "#272727"] },
] as const;
