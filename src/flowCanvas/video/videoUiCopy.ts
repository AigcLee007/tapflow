import type { VideoGenerationMode, VideoModeAvailabilityReason, VideoModeInputCounts, VideoReferenceRole } from "./videoTypes";

export const VIDEO_UI_COPY = {
  videoComposer: "视频创作面板",
  cameraLibrary: "运镜库",
  cameraLibraryDescription: "为视频选择运镜效果",
  cameraCategories: "运镜分类",
  all: "全部",
  favorites: "收藏",
  myMotions: "我的运镜",
  searchMotions: "搜索运镜",
  clear: "清除",
  use: "使用",
  chooseModel: "选择模型",
  chooseVideoModel: "选择视频模型",
  videoParameters: "视频参数",
  aspectRatio: "画面比例",
  auto: "自动",
  palette: "调色盘",
  contextPalette: "上下文调色盘",
  visualTone: "画面色调",
  noReferenceRolesForContextPalette: "当前没有可用的参考角色。",
  selected: "已选中",
  applyVisualTone: "应用画面色调",
  naturalTone: "自然",
  cinematicTealTone: "青橙电影",
  warmSunsetTone: "暖色夕阳",
  coolMoonlightTone: "冷调月光",
  monochromeTone: "黑白",
  amber: "琥珀",
  cyan: "青色",
  rose: "玫红",
  violet: "紫罗兰",
  promptPlaceholder: "描述你想要生成的画面内容",
  videoPrompt: "视频提示词",
  generate: "生成",
  generateVideo: "生成视频",
  generating: "生成中",
  unconfigured: "未配置",
  mode: "生成模式",
  modeOptions: "生成模式选项",
  unsupportedByModel: "当前模型暂不支持",
  unsupportedByCurrentModel: "当前模型不支持",
  loadingModels: "正在加载视频模型",
  modelCatalogError: "视频模型目录加载失败",
  videoModels: "视频模型",
  retry: "重试",
  humanVerification: "真人验证",
  verifyAgain: "重新验证",
  verificationBlocked: "完成真人验证后才能生成视频。",
  completeVerification: "完成验证",
  verified: "已验证",
  referenceSources: "视频参考素材",
  selectReference: "选择参考素材",
  clearReference: "清除参考素材",
  firstFrame: "首帧",
  lastFrame: "尾帧",
} as const;

export const VIDEO_UI_REFERENCE_ROLE_COPY = {
  main_image: "\u4e3b\u53c2\u8003\u56fe",
  reference_image: "\u53c2\u8003\u56fe",
  source_video: "\u6e90\u89c6\u9891",
  reference_video: "\u53c2\u8003\u89c6\u9891",
  reference_audio: "\u53c2\u8003\u97f3\u9891",
  subject: "人物",
  scene: "场景",
  prop: "道具",
  style: "风格",
  first_frame: VIDEO_UI_COPY.firstFrame,
  last_frame: VIDEO_UI_COPY.lastFrame,
  reference: "参考图",
} as const satisfies Record<VideoReferenceRole, string>;

export const VIDEO_UI_MODE_COPY = {
  text_to_video: { label: "文生视频", description: "根据文字描述生成视频" },
  all_reference: { label: "全参考生视频", description: "综合所有参考素材生成视频" },
  image_to_video: { label: "图生视频", description: "使用单张图片作为画面起点" },
  first_last_frame: { label: "首尾帧生视频", description: "根据首帧和尾帧生成视频" },
  image_reference: { label: "图像参考生视频", description: "使用多张图片控制内容与风格" },
} as const satisfies Record<VideoGenerationMode, { label: string; description: string }>;

export function getVideoModeUnavailableReason(
  reason: VideoModeAvailabilityReason,
  counts: VideoModeInputCounts,
): string {
  switch (reason) {
    case "INPUT_MEDIA_NOT_ALLOWED":
      return "\u5df2\u6dfb\u52a0\u5a92\u4f53\u7d20\u6750\uff0c\u65e0\u6cd5\u4f7f\u7528\u6587\u751f\u89c6\u9891";
    case "INPUT_REQUIRES_EXACTLY_ONE_IMAGE":
      return `\u56fe\u751f\u89c6\u9891\u9700\u8981\u6070\u597d 1 \u5f20\u56fe\u7247\uff08\u5f53\u524d ${counts.image} \u5f20\uff09`;
    case "INPUT_REQUIRES_IMAGE":
      return "\u56fe\u50cf\u53c2\u8003\u751f\u89c6\u9891\u9700\u8981\u81f3\u5c11 1 \u5f20\u56fe\u7247";
    case "INPUT_REQUIRES_MEDIA":
      return "\u5168\u53c2\u8003\u751f\u89c6\u9891\u9700\u8981\u81f3\u5c11 1 \u4e2a\u5a92\u4f53\u7d20\u6750";
    case "INPUT_REQUIRES_ONE_OR_TWO_IMAGES":
      return `\u9996\u5c3e\u5e27\u751f\u89c6\u9891\u9700\u8981 1-2 \u5f20\u56fe\u7247\uff08\u5f53\u524d ${counts.image} \u5f20\uff09`;
    case "INPUT_VIDEO_OR_AUDIO_REQUIRES_ALL_REFERENCE":
      return "\u89c6\u9891\u6216\u97f3\u9891\u7d20\u6750\u4ec5\u652f\u6301\u5168\u53c2\u8003\u751f\u89c6\u9891";
    case "MODEL_CONSTRAINT_UNMET":
      return "\u5f53\u524d\u6a21\u578b\u7684\u8f93\u5165\u9650\u5236\u4e0d\u6ee1\u8db3";
    case "MODEL_UNSUPPORTED":
      return "\u5f53\u524d\u6a21\u578b\u4e0d\u652f\u6301\u8be5\u751f\u6210\u6a21\u5f0f";
  }
}

export const VIDEO_UI_BLOCKER_COPY = {
  HUMAN_REVIEW_REQUIRED: "需要完成真人验证",
  NO_VIDEO_GENERATION_ROUTE: "视频生成服务未配置",
  PRICING_NOT_FOUND: "价格配置未完成",
  UNSUPPORTED_ASPECT_RATIO: "当前设置不受支持",
  UNSUPPORTED_AUDIO: "当前模型不支持生成音频",
  UNSUPPORTED_COUNT: "当前设置不受支持",
  UNSUPPORTED_MODE: "当前设置不受支持",
  UNSUPPORTED_RESOLUTION: "当前设置不受支持",
  AUDIO_REFERENCE_REQUIRES_VISUAL: "\u97f3\u9891\u53c2\u8003\u9700\u8981\u540c\u65f6\u63a5\u5165\u56fe\u7247\u6216\u89c6\u9891",
  AUDIO_SETTING_FIXED: "\u5f53\u524d\u6a21\u578b\u7684\u97f3\u9891\u751f\u6210\u8bbe\u7f6e\u4e0d\u53ef\u8c03\u6574",
  UNSUPPORTED_DURATION: "\u5f53\u524d\u6a21\u578b\u4e0d\u652f\u6301\u8be5\u89c6\u9891\u65f6\u957f",
  UNSUPPORTED_VIDEO_MODE: "\u5f53\u524d\u6a21\u578b\u4e0d\u652f\u6301\u8be5\u751f\u6210\u6a21\u5f0f",
  VIDEO_MODE_INPUT_REQUIRED: "\u5f53\u524d\u751f\u6210\u6a21\u5f0f\u9700\u8981\u8865\u5145\u53c2\u8003\u7d20\u6750",
  UNSUPPORTED_REFERENCE_KIND: "\u5f53\u524d\u6a21\u578b\u4e0d\u652f\u6301\u8be5\u53c2\u8003\u7d20\u6750\u7c7b\u578b",
  REFERENCE_LIMIT_EXCEEDED: "\u53c2\u8003\u7d20\u6750\u6570\u91cf\u8d85\u8fc7\u5f53\u524d\u6a21\u578b\u9650\u5236",
  REFERENCE_MEDIA_TOTAL_EXCEEDED: "\u53c2\u8003\u7d20\u6750\u603b\u6570\u8d85\u8fc7\u5f53\u524d\u6a21\u578b\u9650\u5236",
} as const;

const CHINESE_TEXT_PATTERN = /[\u3400-\u9FFF]/u;
const EXTERNAL_CHINESE_DESCRIPTION_PATTERN = /^[\u3400-\u9FFF0-9 ，。；：、（）()·+\-\/:%,]*$/u;
const DISPLAY_RESOLUTION_TOKEN_PATTERN = /\b4K\b/g;
const DURATION_PATTERN = /(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m)\b/i;

export function formatVideoModelEstimatedDuration(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(DURATION_PATTERN);
  if (!match) return null;
  const amount = match[1];
  const unit = match[2].toLowerCase();
  return /^(minutes?|mins?|m)$/.test(unit) ? `预计 ${amount} 分钟` : `预计 ${amount} 秒`;
}

export function getVideoModelDescription(value: unknown): string {
  return isSafeChineseCreatorText(value)
    ? value
    : "暂无中文模型说明";
}

export function isSafeChineseCreatorText(value: unknown): value is string {
  return typeof value === "string"
    && CHINESE_TEXT_PATTERN.test(value)
    && EXTERNAL_CHINESE_DESCRIPTION_PATTERN.test(value.replace(DISPLAY_RESOLUTION_TOKEN_PATTERN, ""));
}
