import { clearPerformanceMeasure, markMeasure, markNow } from '../../performance/performanceMarks';

type CanvasThumbnailPerformanceHelpers = {
  clearPerformanceMeasure: (name: string) => void;
  markMeasure: (name: string, start: string, end: string) => void;
  markNow: (name: string) => void;
};

const draftReadyMark = 'canvas-draft-ready';
const signingStartMark = 'canvas-thumb-signing-start';
const signingEndMark = 'canvas-thumb-signing-end';
const firstThumbMark = 'canvas-first-thumb-visible';
const ninetyPercentMark = 'canvas-visible-thumbs-90pct';
const previewUpgradeMark = 'canvas-preview-upgrade-visible';

export function createCanvasThumbnailPerformanceTracker(
  helpers: CanvasThumbnailPerformanceHelpers = { clearPerformanceMeasure, markMeasure, markNow },
) {
  let expectedAssetIds = new Set<string>();
  let visibleAssetIds = new Set<string>();
  let pendingSigningGroups = 0;
  let generation = 0;
  let draftReady = false;
  let signingStarted = false;
  let signingEnded = false;
  let firstThumbVisible = false;
  let ninetyPercentVisible = false;
  let previewUpgradeVisible = false;

  return {
    reset(_projectId: string): void {
      generation += 1;
      expectedAssetIds = new Set();
      visibleAssetIds = new Set();
      pendingSigningGroups = 0;
      draftReady = false;
      signingStarted = false;
      signingEnded = false;
      firstThumbVisible = false;
      ninetyPercentVisible = false;
      previewUpgradeVisible = false;
      helpers.clearPerformanceMeasure('canvas-draft-ready-to-first-thumb');
      helpers.clearPerformanceMeasure('canvas-thumb-signing');
    },

    markDraftReady(): void {
      if (draftReady) return;
      draftReady = true;
      helpers.markNow(draftReadyMark);
    },

    beginSigning(assetIds: string[]): number | null {
      assetIds.forEach((assetId) => {
        if (assetId) expectedAssetIds.add(assetId);
      });
      if (assetIds.length === 0) return null;
      pendingSigningGroups += 1;
      if (!signingStarted) {
        signingStarted = true;
        helpers.markNow(signingStartMark);
      }
      return generation;
    },

    endSigning(signingGeneration: number | null): void {
      if (signingGeneration !== generation) return;
      if (!signingStarted || pendingSigningGroups === 0) return;
      pendingSigningGroups -= 1;
      if (pendingSigningGroups > 0 || signingEnded) return;
      signingEnded = true;
      helpers.markNow(signingEndMark);
      helpers.markMeasure('canvas-thumb-signing', signingStartMark, signingEndMark);
    },

    markThumbVisible(assetId: string): void {
      if (!expectedAssetIds.has(assetId)) return;
      visibleAssetIds.add(assetId);
      if (!firstThumbVisible) {
        firstThumbVisible = true;
        helpers.markNow(firstThumbMark);
        if (draftReady) helpers.markMeasure('canvas-draft-ready-to-first-thumb', draftReadyMark, firstThumbMark);
      }
      const required = Math.ceil(expectedAssetIds.size * 0.9);
      if (!ninetyPercentVisible && visibleAssetIds.size >= required) {
        ninetyPercentVisible = true;
        helpers.markNow(ninetyPercentMark);
      }
    },

    markPreviewVisible(_assetId: string): void {
      if (previewUpgradeVisible) return;
      previewUpgradeVisible = true;
      helpers.markNow(previewUpgradeMark);
    },
  };
}

export const canvasThumbnailPerformance = createCanvasThumbnailPerformanceTracker();
