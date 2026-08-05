import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

type Viewport = { height: number; width: number };

export type VideoNodeSmokeResult = {
  blockedGenerationDidNotCreateRun: boolean;
  capsuleWidthMatchesContent: boolean;
  cameraGridColumns: number;
  cameraPresetCount: number;
  composerVisible: boolean;
  defaultGeminiSelected: boolean;
  desktopActionsSingleRow: boolean;
  durationRangeIsDefault: boolean;
  editorGeometryByZoom: Array<{ height: number; width: number; zoom: number }>;
  editorRemainsNodeAnchored: boolean;
  editorSizeStableAcrossZoom: boolean;
  emptyPreviewDoesNotOpenUpload: boolean;
  generationControlsLocked: boolean;
  generationFeedbackVisibleUnselected: boolean;
  modelMenuNoSearch: boolean;
  noParameterFlexExpansion: boolean;
  mobileActionsTwoGroups: boolean;
  parameterDialogIsTopLayer: boolean;
  placeholderDropDoesNotUpload: boolean;
  reducedMotionFeedbackSafe: boolean;
  resolutionOptions: string[];
  tabletActionsSingleRow: boolean;
  topUploadButtonOpensUpload: boolean;
  videoNodeHasNoResizeControls: boolean;
};

export type VideoNodeSmokeCheckOptions = {
  desktopScreenshotPath: string;
  mobileScreenshotPath: string;
  narrowScreenshotPath: string;
  tabletScreenshotPath: string;
};

export const VIDEO_NODE_SMOKE_DEFAULT_URL = "http://localhost:5188";
export const VIDEO_NODE_SMOKE_OUTPUT_DIR = path.join("output", "playwright", "video-node");
const SMOKE_HTML_PATH = path.join(VIDEO_NODE_SMOKE_OUTPUT_DIR, "video-node-smoke.html");
const CHECK_CODE_PATH = path.join(VIDEO_NODE_SMOKE_OUTPUT_DIR, "video-node-check.js");

export function buildVideoNodeSmokeHtml(): string {
  return `<!doctype html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Video Node Smoke</title>
    <style>
      html, body, #root { width: 100%; height: 100%; margin: 0; background: #090a0d; }
      .react-flow__node { overflow: visible; }
    </style>
  </head>
  <body>
    <div id="root" data-testid="video-node-smoke-root"></div>
    <script type="module">
      import React, { useEffect } from 'react';
      import { createRoot } from 'react-dom/client';
      import { ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
      import '@xyflow/react/dist/style.css';
      import '/src/index.css';
      import { AuthContext } from '/src/auth/useAuth.ts';
      import { VideoNodeComponent } from '/src/flowCanvas/nodes/FlowNodes.tsx';
      import { useFlowCanvasStore } from '/src/flowCanvas/store/flowCanvasStore.ts';
      import { createDefaultVideoGenerationParams } from '/src/flowCanvas/video/videoGenerationParams.ts';

      const nativeFetch = window.fetch.bind(window);
      window.videoNodeSmokeState = { assetUploadRequestCount: 0, workflowRequestCount: 0 };
      window.fetch = async (input, init) => {
        const requestUrl = typeof input === 'string' ? input : input.url;
        if (requestUrl.includes('/api/v2/ai/model-catalog?modality=video')) {
          return new Response(JSON.stringify([{
            capabilities: {}, defaultRouteKey: 'video.smoke', displayName: 'Gemini Omni Flash', id: 'video-smoke-model',
            modality: 'video', modelFamily: 'smoke', modelId: 'gemini-omni-flash', modelKey: 'gemini-omni-flash', sortOrder: 1,
            status: 'active', uiSchema: { creatorLabel: 'Gemini Omni Flash', description: '电影感运动与光线模型' },
          }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (requestUrl.includes('/api/v2/ai/model-catalog/gemini-omni-flash/routes')) {
          return new Response(JSON.stringify([{
            capabilities: { aspectRatios: ['16:9', '9:16'], audioControlMode: 'always_on_implicit', confirmedByRoute: true,
              durationStepSeconds: 2, maxAudios: 0, maxCount: 1, maxDurationSeconds: 10, maxImages: 5, maxTotal: 6, maxVideos: 1, minDurationSeconds: 4,
              modeConstraints: { all_reference: { maxAudios: 0, maxImages: 5, maxTotal: 6, maxVideos: 1, minVideos: 1 }, image_reference: { maxAudios: 0, maxImages: 5, maxTotal: 5, maxVideos: 0, minImages: 2 }, image_to_video: { maxAudios: 0, maxImages: 1, maxTotal: 1, maxVideos: 0, minImages: 1 }, text_to_video: { maxAudios: 0, maxImages: 0, maxTotal: 0, maxVideos: 0 } },
              referenceSemantics: 'style_images_and_source_video', resolutions: ['720P', '1080P'], supportedDurations: [4, 6, 8, 10],
              supportedModes: ['text_to_video', 'image_to_video', 'image_reference', 'all_reference'], supportedVideoWorkflows: ['video_generation'], supportsAudio: true, supportsHumanReview: false },
            estimatedCredits: 12, minChargeCredits: 1, modality: 'video', modelFamily: 'smoke', modelKey: 'gemini-omni-flash',
            pricing: { billingBasis: 'duration_second', exact: true, minChargeCredits: 1, unit: 'video_generation', unitCredits: 1 }, pricingUnit: 'video_generation', providerKey: 'smoke', providerName: 'Smoke provider', routeId: 'route-smoke',
            routeKey: 'video.smoke', routeLabel: 'Line one',
          }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (requestUrl.includes('/assets/asset-ready-smoke/download-url')) {
          return new Response(JSON.stringify({ url: '/smoke-ready-video.mp4' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (requestUrl.includes('/api/v2/assets/presigned-upload') || requestUrl.includes('/complete-upload') || requestUrl.includes('/upload-bytes')) window.videoNodeSmokeState.assetUploadRequestCount += 1;
        if (requestUrl.includes('/workflow-runs')) window.videoNodeSmokeState.workflowRequestCount += 1;
        return nativeFetch(input, init);
      };

      const auth = { authenticated: true, error: null, loading: false, permissions: [], refreshMe: async () => {},
        register: async () => {}, login: async () => {}, logout: async () => {}, roles: [], sessionId: 'smoke-session',
        tenant: { id: 'smoke-tenant' }, user: { id: 'smoke-user' } };
      const initialNode = {
        id: 'video-smoke-node', type: 'video', position: { x: Math.max(5, (window.innerWidth - 170) / 2), y: 40 }, selected: true,
        data: { kind: 'video', title: '视频', width: 380, height: 220, status: 'idle', generationStatus: 'idle',
          generationPrompt: '在阳光充足的摄影棚中缓慢推进镜头。',
          params: { videoGeneration: { ...createDefaultVideoGenerationParams(), aspectRatio: '9:16', mode: 'text_to_video' } }, createdAt: 1, updatedAt: 1 },
      };
      useFlowCanvasStore.setState({ edges: [], nodes: [initialNode], selectedNodeCount: 1, nodeOutputByNodeId: {}, nodeRunStatusByNodeId: {} });
      window.getVideoSmokeNode = () => useFlowCanvasStore.getState().nodes.find((node) => node.id === 'video-smoke-node');
      window.setVideoSmokeNodeData = (patch) => useFlowCanvasStore.setState((state) => ({ nodes: state.nodes.map((node) => node.id === 'video-smoke-node' ? {
        ...node, data: { ...node.data, ...patch }, selected: true,
      } : node), selectedNodeCount: 1 }));
      window.setVideoSmokeRunStatus = (status) => useFlowCanvasStore.setState((state) => ({
        nodeRunStatusByNodeId: { ...state.nodeRunStatusByNodeId, 'video-smoke-node': status },
      }));
      window.setVideoSmokeSelected = (selected) => useFlowCanvasStore.setState((state) => ({
        nodes: state.nodes.map((node) => node.id === 'video-smoke-node' ? { ...node, selected } : node),
        selectedNodeCount: selected ? 1 : 0,
      }));
      window.resetVideoSmokeBlockedNode = () => {
        window.videoNodeSmokeState.workflowRequestCount = 0;
        useFlowCanvasStore.setState((state) => ({ nodes: state.nodes.map((node) => node.id === 'video-smoke-node' ? {
          ...node, data: { ...node.data, assetId: undefined, assetIds: undefined, durationMs: undefined, modelId: 'unconfigured-video', naturalHeight: undefined, naturalWidth: undefined, source: undefined, status: 'idle', generationStatus: 'idle', errorCode: undefined, errorMessage: undefined }, selected: true,
        } : node), selectedNodeCount: 1 }));
      };
      window.positionVideoSmokeNode = (x) => useFlowCanvasStore.setState((state) => ({ nodes: state.nodes.map((node) => node.id === 'video-smoke-node' ? {
        ...node, position: { ...node.position, x },
      } : node) }));
       function SmokeViewportCoordinator() {
         const reactFlow = useReactFlow();
         window.setVideoSmokeZoom = async (zoom) => {
           await reactFlow.setViewport({ x: 0, y: 0, zoom }, { duration: 0 });
           await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
         };
        useEffect(() => {
          let firstFrame = 0;
          let secondFrame = 0;
          const synchronize = () => {
            const nodeWidth = window.getVideoSmokeNode?.()?.data?.width ?? 170;
            const nodeX = window.innerWidth <= 767 ? 0 : Math.max(5, (window.innerWidth - nodeWidth) / 2);
            useFlowCanvasStore.setState((state) => ({ nodes: state.nodes.map((node) => node.id === 'video-smoke-node' ? {
              ...node, position: { ...node.position, x: nodeX },
            } : node) }));
            // The smoke page changes viewport sizes in one browser session. Explicitly reset
            // XYFlow after layout so a prior desktop transform cannot hide the real composer.
            void reactFlow.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 0 });
          };
          const afterLayout = () => {
            cancelAnimationFrame(firstFrame);
            cancelAnimationFrame(secondFrame);
            firstFrame = requestAnimationFrame(() => {
              synchronize();
              secondFrame = requestAnimationFrame(synchronize);
            });
          };
          afterLayout();
          window.addEventListener('resize', afterLayout);
          return () => {
            cancelAnimationFrame(firstFrame);
            cancelAnimationFrame(secondFrame);
            window.removeEventListener('resize', afterLayout);
          };
        }, [reactFlow]);
        return null;
      }
      function Harness() {
        const nodes = useFlowCanvasStore((state) => state.nodes);
        const onNodesChange = useFlowCanvasStore((state) => state.onNodesChange);
        useEffect(() => () => useFlowCanvasStore.getState().newProject(), []);
        return React.createElement('div', { style: { width: '100%', height: '100%' } },
          React.createElement(ReactFlow, { defaultViewport: { x: 0, y: 0, zoom: 1 }, minZoom: 0.2, nodes, nodeTypes: { video: VideoNodeComponent }, onNodesChange }, React.createElement(SmokeViewportCoordinator)));
      }
      createRoot(document.getElementById('root')).render(
        React.createElement(AuthContext.Provider, { value: auth }, React.createElement(ReactFlowProvider, null, React.createElement(Harness))),
      );
    </script>
  </body>
</html>`;
}

export function buildVideoNodeCheckCode(options: VideoNodeSmokeCheckOptions): string {
  return `(async (page) => {
const desktop = { width: 1440, height: 900 };
const narrow = { width: 1024, height: 768 };
const tablet = { width: 768, height: 900 };
const mobile = { width: 390, height: 844 };
const browser = page.context().browser();
if (!browser) throw new Error('Smoke browser is unavailable');
const smokeUrl = page.url();
async function openViewport(viewport, reducedMotion) {
  const context = await browser.newContext({ viewport, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  const viewportPage = await context.newPage();
  await viewportPage.goto(smokeUrl, { waitUntil: 'networkidle' });
  await viewportPage.waitForSelector('[aria-label="视频创作面板"]', { timeout: 15000 });
  return { context, page: viewportPage };
}
async function assertComposerVisible(viewportPage, viewportName) {
  const rect = await viewportPage.locator('[aria-label="视频创作面板"]').evaluate((composer) => composer.getBoundingClientRect().toJSON());
  const viewport = await viewportPage.evaluate(() => ({ height: window.innerHeight, width: window.innerWidth }));
  const meaningfulWidth = Math.min(320, viewport.width - 32);
  if (rect.width < meaningfulWidth || rect.left < -1 || rect.right > viewport.width + 1 || rect.top < -1 || rect.top >= viewport.height) {
    const canvas = await viewportPage.evaluate(() => ({
      node: document.querySelector('.react-flow__node')?.getAttribute('style'),
      stateNode: window.getVideoSmokeNode?.()?.position,
      transform: document.querySelector('.react-flow__viewport')?.getAttribute('style'),
    }));
    throw new Error('视频创作面板在 ' + viewportName + ' 未正确显示: ' + JSON.stringify({ canvas, rect, viewport }));
  }
}
async function assertNoVisualOverflow(viewportPage) {
  const violations = await viewportPage.locator('button, textarea, input').evaluateAll((elements) => elements.filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && (rect.right > window.innerWidth + 1 || rect.bottom > window.innerHeight + 1);
  }).map((element) => {
    const rect = element.getBoundingClientRect();
    return { label: element.getAttribute('aria-label') || element.textContent?.trim() || 'unnamed', bottom: Math.round(rect.bottom), right: Math.round(rect.right) };
  }));
  if (violations.length) {
    const geometry = await viewportPage.locator('[aria-label="视频创作面板"]').evaluate((composer) => ({
      composer: getComputedStyle(composer).width,
      rect: composer.getBoundingClientRect().toJSON(),
      node: composer.closest('.react-flow__node')?.getAttribute('style'),
      stateNode: window.getVideoSmokeNode?.()?.position,
      viewport: [window.innerWidth, window.innerHeight],
    }));
    throw new Error('Interactive controls overflow viewport: ' + JSON.stringify({ ...geometry, violations }));
  }
}
async function readVideoEditorGeometry(viewportPage) {
  return await viewportPage.locator('[data-node-editor-variant="video"]').evaluate((editor) => {
    const rect = editor.getBoundingClientRect();
    const nodeRect = editor.closest('.react-flow__node')?.getBoundingClientRect();
    return {
      height: rect.height,
      nodeBottom: nodeRect?.bottom ?? null,
      top: rect.top,
      width: rect.width,
    };
  });
}
async function actionLayout(viewportPage) {
  return await viewportPage.locator('[data-testid="video-composer-actions"]').evaluate((actions) => {
    const groups = [...actions.children].map((child) => child.getBoundingClientRect());
    const settingsGroup = actions.querySelector('[data-testid="video-composer-settings-group"]');
    const submitGroup = actions.querySelector('[data-testid="video-composer-submit-group"]');
    return {
      groupCount: groups.length,
      sameRow: Boolean(settingsGroup && submitGroup) && groups.length === 2 && Math.abs(groups[0].top - groups[1].top) <= 1,
    };
  });
}
async function readCapsuleGeometry(viewportPage) {
  return await viewportPage.locator('[aria-label="视频创作面板"]').evaluate((composer) => {
    const readCapsule = (testId) => {
      const capsule = composer.querySelector('[data-testid="' + testId + '"]');
      const trigger = capsule?.querySelector('button');
      const rect = trigger?.getBoundingClientRect();
      return {
        scrollWidth: trigger?.scrollWidth ?? 0,
        width: rect?.width ?? 0,
      };
    };
    return {
      composerWidth: composer.getBoundingClientRect().width,
      model: readCapsule('video-capsule-model'),
      parameters: readCapsule('video-capsule-parameters'),
    };
  });
}

const desktopHarness = await openViewport(desktop, false);
const desktopPage = desktopHarness.page;
let narrowHarness;
let tabletHarness;
let mobileHarness;
try {
await assertComposerVisible(desktopPage, 'desktop');
const composerVisible = await desktopPage.locator('[aria-label="视频创作面板"]').isVisible();
await desktopPage.waitForFunction(() => {
  const node = window.getVideoSmokeNode?.();
  return node?.data?.modelId === 'video-smoke-model' && node?.data?.routeKey === 'video.smoke';
});
const defaultGeminiSelected = await desktopPage.evaluate(() => {
  const node = window.getVideoSmokeNode?.();
  return node?.data?.modelId === 'video-smoke-model' && node?.data?.routeKey === 'video.smoke';
});
const desktopActionLayout = await actionLayout(desktopPage);
const desktopActionsSingleRow = desktopActionLayout.groupCount === 2 && desktopActionLayout.sameRow;
const desktopCapsuleGeometry = await readCapsuleGeometry(desktopPage);
await desktopPage.waitForFunction(() => {
  const node = window.getVideoSmokeNode?.();
  return node?.data?.width === 170 && node?.data?.height === 302 && node?.data?.aspectRatio === 9 / 16;
});
const portraitEmptyNodeIsSized = await desktopPage.evaluate(() => {
  const node = window.getVideoSmokeNode?.();
  const card = [...document.querySelectorAll('[data-id="video-smoke-node"] div')].find((element) => {
    const rect = element.getBoundingClientRect();
    return Math.round(rect.width) === 170 && Math.round(rect.height) === 302;
  });
  return node?.data?.width === 170 && node?.data?.height === 302 && Boolean(card);
});
const emptyUploadInputPresent = await desktopPage.locator('input[accept="video/*"]').count() === 1;
let emptyPreviewFileChooserCount = 0;
const onEmptyPreviewFileChooser = () => { emptyPreviewFileChooserCount += 1; };
desktopPage.on('filechooser', onEmptyPreviewFileChooser);
await desktopPage.getByTestId('video-empty-placeholder').click();
await desktopPage.waitForTimeout(100);
desktopPage.off('filechooser', onEmptyPreviewFileChooser);
const emptyPreviewDoesNotOpenUpload = emptyPreviewFileChooserCount === 0;

const topUploadChooser = desktopPage.waitForEvent('filechooser');
await desktopPage.getByRole('button', { name: /上传/ }).click();
await topUploadChooser;
const topUploadButtonOpensUpload = true;

const uploadsBeforeDrop = await desktopPage.evaluate(() => window.videoNodeSmokeState.assetUploadRequestCount);
await desktopPage.getByTestId('video-empty-placeholder').evaluate((placeholder) => {
  const transfer = new DataTransfer();
  transfer.items.add(new File(['video'], 'dropped.mp4', { type: 'video/mp4' }));
  placeholder.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
});
await desktopPage.waitForTimeout(100);
const uploadsAfterDrop = await desktopPage.evaluate(() => window.videoNodeSmokeState.assetUploadRequestCount);
const placeholderDropDoesNotUpload = uploadsAfterDrop === uploadsBeforeDrop;
const videoNodeHasNoResizeControls = await desktopPage.locator('.react-flow__node[data-id="video-smoke-node"] .react-flow__resize-control').count() === 0;

const editorGeometryByZoom = [];
for (const zoom of [0.25, 0.5, 1, 2]) {
  await desktopPage.evaluate((nextZoom) => window.setVideoSmokeZoom(nextZoom), zoom);
  editorGeometryByZoom.push({ zoom, ...(await readVideoEditorGeometry(desktopPage)) });
}
const editorBaseline = editorGeometryByZoom.find((entry) => entry.zoom === 1);
const editorSizeStableAcrossZoom = editorGeometryByZoom.every((entry) =>
  Math.abs(entry.width - editorBaseline.width) <= 1 && Math.abs(entry.height - editorBaseline.height) <= 1
);
const editorRemainsNodeAnchored = editorGeometryByZoom.every((entry) => {
  const expectedEditorGap = 14 * entry.zoom;
  return entry.nodeBottom !== null && Math.abs(entry.top - entry.nodeBottom - expectedEditorGap) <= 1;
});
await desktopPage.evaluate(() => window.setVideoSmokeZoom(1));
await desktopPage.locator('button[aria-label="选择视频模型"]').click();
await desktopPage.waitForSelector('[aria-label="视频模型"]', { timeout: 15000 });
const modelMenuNoSearch = await desktopPage.locator('[aria-label="视频模型"] input[type="search"], [aria-label="视频模型"] input').count() === 0;
const modelOption = desktopPage.getByRole('option', { name: /Gemini Omni Flash/ });
await modelOption.hover();
const hoverDescriptionVisible = await desktopPage.getByText('电影感运动与光线模型').isVisible();
await modelOption.click();

await desktopPage.evaluate(() => document.querySelector('button[aria-label="运镜库"]')?.click());
await desktopPage.waitForSelector('section[role="dialog"][aria-label="运镜库"]', { timeout: 15000 });
const cameraPresetCount = await desktopPage.locator('[data-camera-motion-id]').count();
const cameraGridColumns = await desktopPage.locator('[data-camera-motion-id]').first().evaluate((first) => {
  const grid = first.parentElement?.parentElement;
  return grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
});
await desktopPage.locator('button[aria-label="关闭运镜库"]').click();
await desktopPage.screenshot({ path: ${JSON.stringify(options.desktopScreenshotPath.replaceAll("\\", "/"))}, fullPage: true });

await desktopPage.locator('button[aria-label="视频参数摘要"]').click();
await desktopPage.waitForSelector('[role="dialog"][aria-label="视频参数"]', { timeout: 15000 });
const parameterDialog = desktopPage.locator('[role="dialog"][aria-label="视频参数"]');
const parameterDialogIsTopLayer = await parameterDialog.evaluate((dialog) => dialog.parentElement === document.body
  && getComputedStyle(dialog).position === 'fixed'
  && Number(getComputedStyle(dialog).zIndex) >= 10020);
const resolutionOptions = await desktopPage.locator('[role="dialog"][aria-label="视频参数"] [role="radio"]').allTextContents();
const countControls = desktopPage.locator('[role="radiogroup"][aria-label="生成数量"] [role="radio"]');
const countOptions = await countControls.allTextContents();
const countDisabledStates = await countControls.evaluateAll((controls) => controls.map((control) => control.getAttribute('aria-disabled')));
const durationOptions = await desktopPage.locator('[role="group"][aria-label="视频时长控制"] button').allTextContents();
const durationRangeIsDefault = durationOptions.map((value) => value.replace(/\\s/g, '')).join('|') === '4秒|6秒|8秒|10秒';
const durationControlCount = durationOptions.length;
const audioGroupCount = await desktopPage.getByRole('radiogroup', { name: '生成音频' }).count();
const hasDurationAudioAndCounts = durationControlCount === 4
  && audioGroupCount === 0
  && countOptions.length === 3
  && countDisabledStates.join('|') === 'false|true|true';
await desktopPage.keyboard.press('Escape');
await desktopPage.waitForSelector('[role="dialog"][aria-label="视频参数"]', { state: 'hidden', timeout: 15000 });

narrowHarness = await openViewport(narrow, false);
await assertComposerVisible(narrowHarness.page, 'narrow');
await assertNoVisualOverflow(narrowHarness.page);
const narrowActionLayout = await actionLayout(narrowHarness.page);
const narrowActionsSingleRow = narrowActionLayout.groupCount === 2 && narrowActionLayout.sameRow;
const narrowCapsuleGeometry = await readCapsuleGeometry(narrowHarness.page);
await narrowHarness.page.screenshot({ path: ${JSON.stringify(options.narrowScreenshotPath.replaceAll("\\", "/"))}, fullPage: true });

tabletHarness = await openViewport(tablet, false);
await assertComposerVisible(tabletHarness.page, 'tablet');
await assertNoVisualOverflow(tabletHarness.page);
const tabletActionLayout = await actionLayout(tabletHarness.page);
const tabletActionsSingleRow = tabletActionLayout.groupCount === 2 && tabletActionLayout.sameRow;
const tabletCapsuleGeometry = await readCapsuleGeometry(tabletHarness.page);
await tabletHarness.page.screenshot({ path: ${JSON.stringify(options.tabletScreenshotPath.replaceAll("\\", "/"))}, fullPage: true });

// The mobile page is a separate prefers-reduced-motion context, not a reload of the desktop canvas.
mobileHarness = await openViewport(mobile, true);
const mobilePage = mobileHarness.page;
await assertComposerVisible(mobilePage, 'mobile');
const mobileActionLayout = await actionLayout(mobilePage);
const mobileActionsTwoGroups = mobileActionLayout.groupCount === 2 && !mobileActionLayout.sameRow;
const mobileCapsuleGeometry = await readCapsuleGeometry(mobilePage);
await mobilePage.evaluate(() => document.querySelector('button[aria-label="运镜库"]')?.click());
await mobilePage.waitForSelector('section[role="dialog"][aria-label="运镜库"] video', { timeout: 15000 });
const reducedMotionVideoIsPaused = await mobilePage.locator('section[role="dialog"][aria-label="运镜库"] video').evaluateAll((videos) => videos.length === 23 && videos.every((video) => video.paused));
await mobilePage.locator('button[aria-label="关闭运镜库"]').click();
await mobilePage.evaluate(() => window.setVideoSmokeRunStatus?.('pending'));
await mobilePage.getByRole('status').filter({ hasText: '正在提交任务' }).waitFor({ state: 'visible' });
const generationControlsLocked = await mobilePage.evaluate(() => {
  const selectors = [
    'textarea[aria-label="视频提示词"]',
    '[data-testid="video-composer-tools"] button',
    '[data-testid="video-composer-settings-group"] button',
    'button[aria-label="生成视频"]',
  ];
  const controls = selectors.flatMap((selector) => [...document.querySelectorAll(selector)]);
  return controls.length >= 7 && controls.every((control) => control.disabled);
});
await mobilePage.evaluate(() => window.setVideoSmokeSelected?.(false));
const generationFeedbackVisibleUnselected = await mobilePage.getByRole('status').filter({ hasText: '正在提交任务' }).isVisible();
await mobilePage.evaluate(() => window.setVideoSmokeRunStatus?.('waiting_provider'));
await mobilePage.getByRole('status').filter({ hasText: '正在生成视频' }).waitFor({ state: 'visible' });
const reducedMotionFeedbackSafe = await mobilePage.getByTestId('video-generation-indicator').evaluate((indicator) => getComputedStyle(indicator).animationName === 'none');
const generationFeedbackHasNoPercent = await mobilePage.getByRole('status').evaluate((status) => !/\d+%/.test(status.textContent || ''));
await mobilePage.evaluate(() => {
  window.setVideoSmokeRunStatus?.('idle');
  window.setVideoSmokeSelected?.(true);
});
await mobilePage.evaluate(() => window.setVideoSmokeNodeData?.({
  assetId: 'asset-ready-smoke', assetIds: ['asset-ready-smoke'], durationMs: 8000,
  generationStatus: 'done', height: 302, mimeType: 'video/mp4', naturalHeight: 1920,
  naturalWidth: 1080, source: 'generated', status: 'success', width: 170,
}));
await mobilePage.waitForSelector('video[aria-label="视频预览"]', { timeout: 15000 });
const readyControls = await mobilePage.evaluate(() => ({
  download: document.querySelectorAll('button[aria-label="下载视频"]').length === 1,
  fullscreen: document.querySelectorAll('button[aria-label="全屏预览"]').length === 1,
  upload: document.querySelectorAll('input[accept="video/*"]').length === 0,
}));
const readyPreviewUsesContain = await mobilePage.locator('video[aria-label="视频预览"]').evaluate((video) => getComputedStyle(video).objectFit === 'contain');
await assertNoVisualOverflow(mobilePage);
await mobilePage.screenshot({ path: ${JSON.stringify(options.mobileScreenshotPath.replaceAll("\\", "/"))}, fullPage: true });

// VideoNodeComponent owns the runBackendWorkflow call. A blocked node must never reach it,
// so the harness verifies that no workflow request is emitted after its Generate action.
await mobilePage.evaluate(() => window.resetVideoSmokeBlockedNode());
const blockedGenerationDidNotCreateRun = await mobilePage.locator('button[aria-label="生成视频"]').evaluate((button) => button.disabled)
  && await mobilePage.evaluate(() => window.videoNodeSmokeState.workflowRequestCount === 0);
const capsuleGeometryByViewport = [desktopCapsuleGeometry, narrowCapsuleGeometry, tabletCapsuleGeometry, mobileCapsuleGeometry];
const capsuleWidthMatchesContent = capsuleGeometryByViewport.every(({ model, parameters }) =>
  model.width > 0 && parameters.width > 0
  && model.width <= model.scrollWidth + 24
  && parameters.width <= parameters.scrollWidth + 24,
);
const noParameterFlexExpansion = capsuleGeometryByViewport.every(({ composerWidth, parameters }) =>
  parameters.width < composerWidth * 0.75,
);

const result = { blockedGenerationDidNotCreateRun, capsuleWidthMatchesContent, cameraGridColumns, cameraPresetCount, composerVisible, defaultGeminiSelected, desktopActionsSingleRow, durationRangeIsDefault, editorGeometryByZoom, editorRemainsNodeAnchored, editorSizeStableAcrossZoom, emptyPreviewDoesNotOpenUpload, emptyUploadInputPresent, generationControlsLocked, generationFeedbackVisibleUnselected, mobileActionsTwoGroups, modelMenuNoSearch, noParameterFlexExpansion, parameterDialogIsTopLayer, placeholderDropDoesNotUpload, portraitEmptyNodeIsSized, readyControls, readyPreviewUsesContain, reducedMotionFeedbackSafe, resolutionOptions, tabletActionsSingleRow, topUploadButtonOpensUpload, videoNodeHasNoResizeControls };
if (!composerVisible || !defaultGeminiSelected || !desktopActionsSingleRow || !narrowActionsSingleRow || !tabletActionsSingleRow || !mobileActionsTwoGroups || !generationFeedbackVisibleUnselected || !generationControlsLocked || !reducedMotionFeedbackSafe || !generationFeedbackHasNoPercent || !modelMenuNoSearch || !hoverDescriptionVisible || !hasDurationAudioAndCounts || !durationRangeIsDefault || !parameterDialogIsTopLayer || !resolutionOptions.includes('1080P') || cameraGridColumns !== 4 || cameraPresetCount !== 23 || !reducedMotionVideoIsPaused || !blockedGenerationDidNotCreateRun || !capsuleWidthMatchesContent || !noParameterFlexExpansion || !portraitEmptyNodeIsSized || !emptyUploadInputPresent || !emptyPreviewDoesNotOpenUpload || !topUploadButtonOpensUpload || !placeholderDropDoesNotUpload || !videoNodeHasNoResizeControls || !editorSizeStableAcrossZoom || !editorRemainsNodeAnchored || !readyControls.download || !readyControls.fullscreen || !readyControls.upload || !readyPreviewUsesContain) {
  throw new Error(JSON.stringify({ ...result, capsuleGeometryByViewport, generationFeedbackHasNoPercent, hasDurationAudioAndCounts, durationControlCount, durationOptions, audioGroupCount, countDisabledStates, countOptions, hoverDescriptionVisible, narrowActionsSingleRow, reducedMotionVideoIsPaused }));
}
return JSON.stringify({ ...result, status: 'ok' });
} finally {
  await mobileHarness?.context.close();
  await tabletHarness?.context.close();
  await narrowHarness?.context.close();
  await desktopHarness.context.close();
}
})`;
}

export function parsePlaywrightCliJson(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.startsWith("### Error")) throw new Error(trimmed);
  const parsed = JSON.parse(trimmed);
  return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
}

async function findFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function commandInvocation(command: string, args: string[]) {
  if (process.platform !== "win32") return { command, args };
  const quote = (value: string) => /[ \t"&()<>^|]/.test(value) ? `"${value.replace(/(["^&|<>])/g, "^$1")}"` : value;
  return { command: "cmd.exe", args: ["/d", "/s", "/c", [command, ...args].map(quote).join(" ")] };
}

function runCommand(command: string, args: string[], timeoutMs = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const invocation = commandInvocation(command, args);
    const child = spawn(invocation.command, invocation.args, { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`${command} timed out after ${timeoutMs}ms`)); }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("close", (code) => { clearTimeout(timeout); code === 0 ? resolve(stdout.trim()) : reject(new Error(`${command} ${args.join(" ")} failed with ${code}\n${stdout}\n${stderr}`)); });
  });
}

function spawnVite(port: number): ChildProcessWithoutNullStreams {
  const invocation = commandInvocation(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port)]);
  return spawn(invocation.command, invocation.args, { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
}

async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return; } catch { /* keep polling */ }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopProcessTree(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (!child.pid) return;
  if (process.platform === "win32") { await runCommand("taskkill", ["/PID", String(child.pid), "/T", "/F"], 30_000).catch(() => ""); return; }
  child.kill("SIGTERM");
}

async function runSmoke(): Promise<void> {
  const port = await findFreePort();
  const session = `tapflow-video-node-${Date.now()}`;
  const pageUrl = `http://127.0.0.1:${port}/${SMOKE_HTML_PATH.replaceAll("\\", "/")}`;
  const screenshots = { desktopScreenshotPath: path.join(VIDEO_NODE_SMOKE_OUTPUT_DIR, "desktop.png"), narrowScreenshotPath: path.join(VIDEO_NODE_SMOKE_OUTPUT_DIR, "narrow.png"), tabletScreenshotPath: path.join(VIDEO_NODE_SMOKE_OUTPUT_DIR, "tablet.png"), mobileScreenshotPath: path.join(VIDEO_NODE_SMOKE_OUTPUT_DIR, "mobile.png") };
  const vite = spawnVite(port);
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  try {
    await mkdir(VIDEO_NODE_SMOKE_OUTPUT_DIR, { recursive: true });
    await writeFile(SMOKE_HTML_PATH, buildVideoNodeSmokeHtml(), "utf8");
    await writeFile(CHECK_CODE_PATH, buildVideoNodeCheckCode(screenshots), "utf8");
    await waitForServer(`http://127.0.0.1:${port}/`);
    await runCommand(npx, ["--yes", "--package", "@playwright/cli", "playwright-cli", `-s=${session}`, "open", pageUrl]);
    const raw = await runCommand(npx, ["--yes", "--package", "@playwright/cli", "playwright-cli", `-s=${session}`, "--raw", "run-code", "--filename", CHECK_CODE_PATH]);
    console.log(JSON.stringify({ defaultUrl: VIDEO_NODE_SMOKE_DEFAULT_URL, result: parsePlaywrightCliJson(raw), screenshots, smokePage: SMOKE_HTML_PATH, status: "ok" }, null, 2));
  } finally {
    await runCommand(npx, ["--yes", "--package", "@playwright/cli", "playwright-cli", `-s=${session}`, "close"], 30_000).catch(() => "");
    await stopProcessTree(vite);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSmoke().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
