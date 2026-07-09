import type { AiPluginManifest } from "../plugin-manifest.js";

export const tapflowVideoEditorFfmpegManifest: AiPluginManifest = {
  credentials: {
    fields: [],
    type: "bearer",
  },
  description: "TapFlow server-side FFmpeg export route for canvas video editor timelines.",
  displayName: "Video Editor FFmpeg Export",
  modality: "video",
  models: [
    {
      capabilities: {
        supportedAspectRatios: ["16:9", "9:16", "1:1"],
        supportedSizes: ["1280x720", "1920x1080", "1080x1920", "1080x1080"],
      },
      defaultRouteKey: "video.editor.ffmpeg",
      displayName: "Video Editor FFmpeg",
      modality: "video",
      modelFamily: "tapflow.video-editor",
      modelKey: "video-editor-ffmpeg",
      sortOrder: 70,
      uiSchema: {
        fields: [],
        panelLayout: "video",
      },
    },
  ],
  packageKey: "tapflow.video-editor-ffmpeg",
  pricing: [
    {
      metadata: {
        billingContext: "video_editor_export",
        internalRenderEngine: "ffmpeg",
        source: "tapflow-video-editor-ffmpeg",
      },
      minChargeCredits: 50,
      model: "video-editor-ffmpeg",
      provider: "tapflow-local-render",
      route: "video.editor.ffmpeg",
      unit: "video_generation",
      unitCredits: 50,
    },
  ],
  provider: {
    capabilities: {
      internalRender: true,
      supportedVideoWorkflows: ["video_editor_export"],
      videoEditorRenderEngine: "ffmpeg",
    },
    defaultBaseUrl: "internal://tapflow-video-renderer",
    key: "tapflow-local-render",
    kind: "mock",
    name: "TapFlow Local Renderer",
  },
  routes: [
    {
      mode: "sync",
      modality: "video",
      modelFamily: "tapflow.video-editor",
      modelKey: "video-editor-ffmpeg",
      path: "/internal/video-editor/render",
      priority: 30,
      requestConfig: {
        apiMode: "internal-render",
        capabilities: {
          supportedVideoWorkflows: ["video_editor_export"],
          videoEditorRenderEngine: "ffmpeg",
        },
        internalRender: true,
        path: "/internal/video-editor/render",
        timeoutMs: 300000,
      },
      routeKey: "video.editor.ffmpeg",
      routeLabel: "FFmpeg Export",
      timeoutMs: 300000,
    },
  ],
  tests: [
    {
      expected: {
        status: "succeeded",
      },
      key: "video-editor-export",
      label: "Video editor export manifest smoke",
      request: {
        metadata: {
          videoEditorExport: {
            source: "video_editor_export",
          },
        },
        prompt: "Export a saved video editor timeline.",
      },
      routeKey: "video.editor.ffmpeg",
    },
  ],
  version: "1.0.0",
};
