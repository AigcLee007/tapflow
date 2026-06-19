import type { WorkbenchGeneration, WorkbenchResult } from "./workbenchTypes";

export type WorkbenchFeedSlot =
  | { index: number; kind: "result"; result: WorkbenchResult }
  | { index: number; kind: "pending" | "failed" };

export type WorkbenchMosaicLayout = {
  containerClassName: string;
  imageClassName: string;
  slotClassNames: string[];
};

function isTerminalFailed(status: string) {
  return status === "failed" || status === "canceled";
}

export function getSortedWorkbenchResults(results: WorkbenchResult[]) {
  return results
    .slice()
    .sort((left, right) => Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0));
}

export function getWorkbenchSlotCount(generation: WorkbenchGeneration, results: WorkbenchResult[]) {
  return Math.max(
    1,
    Number(generation.requestedCount || 0),
    Number(generation.batch?.totalCount || 0),
    results.length,
  );
}

export function buildWorkbenchFeedSlots(generation: WorkbenchGeneration, results: WorkbenchResult[]): WorkbenchFeedSlot[] {
  const sortedResults = getSortedWorkbenchResults(results);
  const total = getWorkbenchSlotCount(generation, sortedResults);
  return Array.from({ length: total }, (_, index) => {
    const result = sortedResults[index];
    if (result) return { index, kind: "result", result };
    return { index, kind: isTerminalFailed(generation.status) ? "failed" : "pending" };
  });
}

function readAspectRatio(generation: WorkbenchGeneration, results: WorkbenchResult[]) {
  const firstResultWithDimensions = results.find((result) => result.width && result.height);
  if (firstResultWithDimensions?.width && firstResultWithDimensions.height) {
    return firstResultWithDimensions.width / firstResultWithDimensions.height;
  }
  const rawRatio = String(generation.params.aspect_ratio || generation.params.aspectRatio || "");
  const [rawWidth, rawHeight] = rawRatio.split(":").map((value) => Number(value));
  if (rawWidth > 0 && rawHeight > 0) return rawWidth / rawHeight;
  return 1;
}

export function getWorkbenchMosaicLayout(
  generation: WorkbenchGeneration,
  results: WorkbenchResult[],
  slotCount: number,
): WorkbenchMosaicLayout {
  const ratio = readAspectRatio(generation, results);
  const isWide = ratio >= 1.45;
  const isUltraWide = ratio >= 2;
  const wideAspect = isUltraWide ? "aspect-[21/9]" : "aspect-[16/9]";

  if (slotCount <= 1) {
    return {
      containerClassName: "grid gap-0 overflow-hidden rounded-[6px] border border-white/8 bg-[#090b10]",
      imageClassName: isWide ? "object-cover" : "object-contain",
      slotClassNames: [`${isWide ? wideAspect : "aspect-[4/5]"} w-full`],
    };
  }

  if (slotCount === 2) {
    const useStack = isWide;
    return {
      containerClassName: `grid gap-px overflow-hidden rounded-[6px] border border-white/8 bg-black ${useStack ? "grid-cols-1" : "grid-cols-2"}`,
      imageClassName: "object-cover",
      slotClassNames: Array.from({ length: 2 }, () => (useStack ? `${wideAspect} w-full` : "aspect-[3/4] w-full")),
    };
  }

  if (slotCount === 3 && isWide) {
    return {
      containerClassName: "grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-white/8 bg-black",
      imageClassName: "object-cover",
      slotClassNames: [wideAspect, wideAspect, `col-span-1 ${wideAspect}`],
    };
  }

  if (slotCount === 3) {
    return {
      containerClassName: "grid grid-cols-3 gap-px overflow-hidden rounded-[6px] border border-white/8 bg-black",
      imageClassName: "object-cover",
      slotClassNames: Array.from({ length: 3 }, () => "aspect-[3/4]"),
    };
  }

  return {
    containerClassName: "grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-white/8 bg-black",
    imageClassName: "object-cover",
    slotClassNames: Array.from({ length: slotCount }, () => (isWide ? wideAspect : "aspect-[4/3]")),
  };
}
