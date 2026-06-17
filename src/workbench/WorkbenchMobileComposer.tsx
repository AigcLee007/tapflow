import React from "react";
import { Sparkles } from "lucide-react";

import type { ImageModelConfig } from "../config/imageModels";
import { WorkbenchComposer } from "./WorkbenchComposer";
import type { WorkbenchDraft } from "./workbenchTypes";

type Props = {
  draft: WorkbenchDraft;
  isGenerating: boolean;
  models: ImageModelConfig[];
  onChangeDraft: (patch: Partial<WorkbenchDraft>) => void;
  onGenerate: () => void;
};

export function WorkbenchMobileComposer(props: Props) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        className="fixed bottom-4 left-4 right-4 z-30 flex h-14 items-center justify-between rounded-full border border-white/10 bg-[#111217]/95 px-4 text-left shadow-[0_18px_42px_rgba(0,0,0,0.45)] md:hidden"
        onClick={() => setOpen(true)}
        type="button"
      >
        <span className="truncate text-sm text-slate-300">{props.draft.prompt || "描述你想生成的画面"}</span>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-black">
          <Sparkles size={16} />
        </span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            aria-label="关闭工作台输入"
            className="absolute inset-0 bg-black/55"
            onClick={() => setOpen(false)}
            type="button"
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[88vh] overflow-hidden rounded-t-[26px] border border-white/10 bg-[#101014] shadow-[0_-22px_70px_rgba(0,0,0,0.6)]">
            <WorkbenchComposer {...props} compact onAfterGenerate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
