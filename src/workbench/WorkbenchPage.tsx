import React from "react";

import { useImageModelCatalog } from "../hooks/useImageModelCatalog";
import { sendWorkbenchResultToProject } from "../services/v2WorkbenchApi";
import { createDefaultWorkbenchDraft } from "./workbenchModelParams";
import { SendToProjectDialog } from "./SendToProjectDialog";
import { WorkbenchComposer } from "./WorkbenchComposer";
import { WorkbenchMobileComposer } from "./WorkbenchMobileComposer";
import { WorkbenchResultFeed } from "./WorkbenchResultFeed";
import { WorkbenchResultSheet } from "./WorkbenchResultSheet";
import { useWorkbenchGenerations } from "./useWorkbenchGenerations";
import type { WorkbenchGeneration, WorkbenchResult } from "./workbenchTypes";

function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function WorkbenchPage() {
  const { models } = useImageModelCatalog();
  const {
    error,
    generations,
    loading,
    retry,
    submit,
    submitting,
  } = useWorkbenchGenerations();
  const [draft, setDraft] = React.useState(() => createDefaultWorkbenchDraft());
  const [selectedResult, setSelectedResult] = React.useState<WorkbenchResult | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = React.useState(false);

  React.useEffect(() => {
    if (models.length === 0) return;
    setDraft((current) => (current.modelId ? current : createDefaultWorkbenchDraft(models)));
  }, [models]);

  const reuseParams = React.useCallback((generation: WorkbenchGeneration) => {
    setDraft({
      aspectRatio: String(generation.params.aspect_ratio || generation.params.aspectRatio || "1:1"),
      displayMode: generation.displayMode,
      modelId: generation.modelId,
      moderation: String(generation.params.moderation || "auto") as "auto" | "low",
      outputFormat: String(generation.params.output_format || "png") as "jpeg" | "png" | "webp",
      prompt: generation.prompt,
      quality: String(generation.params.quality || "auto") as "auto" | "high" | "low" | "medium",
      quantity: generation.requestedCount,
      referenceAssetIds: generation.referenceAssetIds,
      routeKey: generation.routeKey,
      size: String(generation.params.size || generation.params.imageSize || "1k").toLowerCase(),
    });
  }, []);

  const handleSendToProject = React.useCallback(async (input: { projectName?: string }) => {
    if (!selectedResult) return;
    const created = await sendWorkbenchResultToProject(selectedResult.id, input);
    setSendDialogOpen(false);
    setSelectedResult(null);
    navigate(`/projects/${created.projectId}`);
  }, [selectedResult]);

  return (
    <section className="min-h-[calc(100vh-120px)]">
      <div className="mb-6">
        <div className="text-xs uppercase tracking-[0.22em] text-cyan-300">Workbench</div>
        <h1 className="mt-2 text-3xl font-semibold text-white">独立生图工作台</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          不依赖项目即可直接生图，生成结果会进入云端素材与工作台历史，发送到画布是后续显式动作。
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <div className="relative block min-h-[640px] overflow-hidden rounded-[26px] border border-white/8 bg-[#0b0b0f] md:grid md:h-[calc(100vh-210px)] md:grid-cols-[390px_minmax(0,1fr)]">
        <div className="hidden md:block">
          <WorkbenchComposer
            draft={draft}
            isGenerating={submitting}
            models={models}
            onChangeDraft={(patch) => setDraft((current) => ({ ...current, ...patch }))}
            onGenerate={() => void submit(draft)}
          />
        </div>

        <div className="min-h-0 overflow-y-auto p-5 pb-28 md:pb-5">
          {loading ? (
            <div className="grid min-h-[280px] place-items-center rounded-[24px] border border-white/8 bg-white/[0.03] text-sm text-slate-500">
              正在加载工作台历史...
            </div>
          ) : (
            <WorkbenchResultFeed
              generations={generations}
              onReuseParams={reuseParams}
              onRetry={(generationId) => void retry(generationId)}
              onSelectResult={setSelectedResult}
            />
          )}
        </div>

        <WorkbenchMobileComposer
          draft={draft}
          isGenerating={submitting}
          models={models}
          onChangeDraft={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          onGenerate={() => void submit(draft)}
        />
      </div>

      <WorkbenchResultSheet
        onClose={() => setSelectedResult(null)}
        onSendToProject={() => setSendDialogOpen(true)}
        result={selectedResult}
      />
      <SendToProjectDialog
        onClose={() => setSendDialogOpen(false)}
        onConfirm={(input) => void handleSendToProject(input)}
        open={sendDialogOpen}
      />
    </section>
  );
}
