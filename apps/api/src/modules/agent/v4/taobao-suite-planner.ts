import type { AgentV4GenerationItem } from "./agent-v4-types.js";

export type SuitePlan = { targetPlatform: "taobao"; mainImageCount: number; detailPageCount: number; pages: Array<{ pageKey: string; purpose: string; dependsOn: string[] }> };
export type VisualBible = { productLock: string; palette: string[]; lighting: string; background: string; typography: string; composition: string; prohibitions: string[] };

export function createTaobaoSuitePlan(input: { mainImageCount?: number; detailPageCount?: number; prompt?: string } = {}): SuitePlan {
  const main = Math.min(10, Math.max(1, input.mainImageCount ?? 5));
  const detail = Math.min(20, Math.max(1, input.detailPageCount ?? 8));
  const pages = Array.from({ length: main + detail }, (_, index) => {
    const isMain = index < main;
    const number = isMain ? index + 1 : index - main + 1;
    return { pageKey: `${isMain ? "main" : "detail"}-${number}`, purpose: isMain ? (number === 1 ? "首屏白底商品主图，突出主体完整轮廓" : `主图卖点${number}，强化核心卖点与使用场景`) : `详情页${number}，承接卖点、参数或使用说明`, dependsOn: isMain && number === 1 ? [] : ["base"] };
  });
  return { targetPlatform: "taobao", mainImageCount: main, detailPageCount: detail, pages };
}

export function createVisualBible(productSummary: string): VisualBible {
  const summary = productSummary.trim().slice(0, 1800);
  return { productLock: `只依据参考实拍图锁定商品外形、比例、材质、颜色、接口和品牌标识；不得凭空改款。${summary}`, palette: ["以实拍图主色为准", "背景使用低干扰中性色", "品牌色仅用于强调"], lighting: "柔和均匀棚拍光，保留真实材质高光与阴影", background: "干净、克制、符合淘宝信息层级的背景", typography: "中文短句、清晰高对比，避免覆盖商品主体", composition: "主体优先，关键卖点位于安全区，跨页保持相同镜头语言", prohibitions: ["不得改变商品结构、颜色、材质或文字标识", "不得添加未提供的配件和功能", "不得生成乱码、虚假参数或水印"] };
}

export function createPromptItems(plan: SuitePlan, bible: VisualBible, referenceAssetIds: string[]): AgentV4GenerationItem[] {
  return plan.pages.map((page) => ({ itemId: page.pageKey, pageKey: page.pageKey, prompt: `${bible.productLock}\n页面目的：${page.purpose}\n构图：${bible.composition}\n光线背景：${bible.lighting}；${bible.background}\n文字安全区：右上或底部留白，不遮挡商品。\n负面约束：${bible.prohibitions.join("；")}`, referenceAssetIds: [...referenceAssetIds], status: "queued" }));
}
