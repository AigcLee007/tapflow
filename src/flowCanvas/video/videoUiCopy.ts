import type { VideoGenerationMode, VideoReferenceRole } from "./videoTypes";

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
  palette: "调色盘",
  promptPlaceholder: "描述你想要生成的画面内容",
  videoPrompt: "视频提示词",
  generate: "生成",
  generateVideo: "生成视频",
  generating: "生成中",
  unconfigured: "未配置",
  mode: "生成模式",
  modeOptions: "生成模式选项",
  unsupportedByModel: "当前模型暂不支持",
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

export const VIDEO_UI_BLOCKER_COPY = {
  HUMAN_REVIEW_REQUIRED: "需要完成真人验证",
  NO_VIDEO_GENERATION_ROUTE: "视频生成服务未配置",
  PRICING_NOT_FOUND: "价格配置未完成",
  UNSUPPORTED_ASPECT_RATIO: "当前设置不受支持",
  UNSUPPORTED_AUDIO: "当前模型不支持生成音频",
  UNSUPPORTED_COUNT: "当前设置不受支持",
  UNSUPPORTED_MODE: "当前设置不受支持",
  UNSUPPORTED_RESOLUTION: "当前设置不受支持",
} as const;

const CHINESE_TEXT_PATTERN = /[\u3400-\u9FFF]/u;
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
  return typeof value === "string" && CHINESE_TEXT_PATTERN.test(value)
    ? value
    : "暂无中文模型说明";
}
