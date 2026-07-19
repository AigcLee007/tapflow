export const VIDEO_VISUAL_TOKENS = {
  controlHeight: "h-9",
  controlRadius: "rounded-lg",
  panelRadius: "rounded-[10px]",
  panelSurface: "bg-[#242424]",
  selected: "border-white bg-white/10 text-white",
  unselected: "border-white/20 bg-[#242424] text-white/65 hover:border-white/45 hover:text-white",
  disabled: "cursor-not-allowed border-white/10 bg-[#1c1c1c] text-white/35",
} as const;

export const VIDEO_VISUAL_CONTROL_CLASS = `${VIDEO_VISUAL_TOKENS.controlHeight} ${VIDEO_VISUAL_TOKENS.controlRadius} border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#242424]`;
