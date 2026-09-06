import { normalizeSkillSource } from "./skill-normalizer.js";
import type { NormalizedSkill, SkillSource } from "./skill-types.js";

export type OfficialAgentSkill = SkillSource & {
  normalized: NormalizedSkill;
  slug: string;
  visibility: "official";
};

function createOfficialSkill(slug: string, source: SkillSource): OfficialAgentSkill {
  return { ...source, normalized: normalizeSkillSource(source), slug, visibility: "official" };
}

export const OFFICIAL_AGENT_SKILLS: OfficialAgentSkill[] = [
  createOfficialSkill("concept-short-video-script", {
    name: "短视频脚本策划",
    summary: "把主题和卖点整理成可拍摄的短视频脚本。",
    usageScenarios: "品牌短视频\n产品种草\n社交媒体内容",
    inputs: "主题\n受众\n核心卖点",
    method: "分析主题与受众\n生成开场、主体、结尾和镜头提示\n检查节奏与信息完整性",
    outputs: "完整脚本\n镜头清单\n发布文案",
    askWhen: "缺少主题、受众或核心卖点时追问",
    modality: "text",
    category: "内容策划",
    triggers: ["短视频脚本", "视频脚本"],
  }),
  createOfficialSkill("ad-copy-and-storyboard", {
    name: "广告文案与分镜",
    summary: "从产品信息产出广告文案和可执行分镜。",
    usageScenarios: "商品广告\n品牌宣传\n活动预告",
    inputs: "产品信息\n传播目标\n画幅和时长",
    method: "分析传播目标\n生成多版广告文案\n整理镜头顺序和画面描述",
    outputs: "广告文案\n分镜表\n画面提示词",
    askWhen: "缺少传播目标、受众或画幅时追问",
    modality: "text",
    category: "广告创作",
    triggers: ["广告文案", "分镜"],
  }),
  createOfficialSkill("product-image-direction", {
    name: "产品图视觉指导",
    summary: "将产品卖点转化为统一的产品视觉方向。",
    usageScenarios: "电商主图\n品牌产品视觉\n宣传海报",
    inputs: "产品图\n卖点\n期望风格",
    method: "分析产品主体和卖点\n制定构图、光线和色彩方向\n生成图像制作节点",
    outputs: "视觉方向\n图像提示词\n产品图",
    askWhen: "缺少产品图或期望风格时追问",
    modality: "image",
    category: "产品视觉",
    triggers: ["产品图", "电商主图"],
  }),
  createOfficialSkill("taobao-product-image-suite", {
    name: "淘宝商品套图",
    summary: "分析商品实拍图，规划淘宝主图与详情页套图，并保持跨页面主体和视觉一致性。",
    usageScenarios: "淘宝商品主图\n淘宝详情页\n电商上新套图",
    inputs: "商品实拍图\n商品类目与规格\n主图数量\n详情页页数\n品牌风格与卖点\n不可改变的产品特征",
    method: "先分析实拍图中的商品主体、材质、颜色、结构和可用视角\n根据淘宝展示目标规划主图与详情页的页面数量、顺序、画幅和信息层级\n建立商品视觉圣经，锁定主体特征、色板、字体语气、光线和背景规则\n为每一页生成包含构图、文案、负面约束和参考图绑定的提示词\n批量创建图片节点并复用同一视觉上下文\n逐页检查主体一致性、卖点覆盖、文字安全区和交付完整性，失败页面单独重试",
    outputs: "实拍图分析\n主图与详情页规划\n商品视觉圣经\n逐页提示词\n套图节点与生成结果\n一致性与交付检查报告",
    askWhen: "缺少商品实拍图、类目、目标尺寸或核心卖点时追问；未说明数量时按平台常见套图先给出可调整方案",
    modality: "image",
    category: "电商视觉",
    triggers: ["淘宝主图", "淘宝详情页", "商品套图", "电商套图"],
  }),
  createOfficialSkill("image-variations", {
    name: "图片变体",
    summary: "基于一张参考图生成多种可比较的视觉变体。",
    usageScenarios: "风格探索\n构图探索\n广告版本测试",
    inputs: "参考图\n变化方向\n输出数量",
    method: "分析参考图的主体与构图\n生成变体计划\n按计划生成并检查一致性",
    outputs: "变体图片\n变化说明\n推荐版本",
    askWhen: "缺少参考图或变化方向时追问",
    modality: "image",
    category: "图片创作",
    triggers: ["图片变体", "生成多个版本"],
  }),
  createOfficialSkill("product-short-video", {
    name: "商品短视频",
    summary: "从产品素材和卖点生成商品短视频创作流程。",
    usageScenarios: "商品详情页视频\n短视频广告\n直播预热视频",
    inputs: "产品图或视频\n卖点\n视频时长\n画幅",
    method: "分析产品素材\n生成脚本和分镜\n生成视频画面并检查成片",
    outputs: "脚本\n分镜\n商品短视频",
    askWhen: "缺少产品素材、时长或画幅时追问",
    modality: "video",
    category: "视频创作",
    triggers: ["商品视频", "产品短视频"],
  }),
  createOfficialSkill("travel-video", {
    name: "旅行视频",
    summary: "把旅行素材整理成有节奏和情绪的旅行视频。",
    usageScenarios: "旅行记录\n城市宣传\n目的地短片",
    inputs: "旅行素材\n目的地信息\n风格\n视频时长",
    method: "分析素材和目的地叙事\n生成旁白脚本与分镜\n生成视频并检查节奏",
    outputs: "旁白脚本\n分镜\n旅行视频",
    askWhen: "缺少旅行素材、风格或时长时追问",
    modality: "video",
    category: "视频创作",
    triggers: ["旅行视频", "旅行短片"],
  }),
  createOfficialSkill("image-to-video", {
    name: "图生视频",
    summary: "将一张或多张图片转化为具有运动和镜头变化的视频。",
    usageScenarios: "静态海报动效\n产品展示\n照片故事",
    inputs: "参考图片\n运动方向\n视频时长\n画幅",
    method: "分析图片主体和空间关系\n生成运动脚本\n生成视频并检查主体稳定性",
    outputs: "运动脚本\n图生视频",
    askWhen: "缺少参考图片、运动方向或时长时追问",
    modality: "video",
    category: "视频创作",
    triggers: ["图生视频", "图片转视频"],
  }),
];
