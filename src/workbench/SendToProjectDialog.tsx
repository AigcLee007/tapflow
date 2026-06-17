import React from "react";

type Props = {
  onClose: () => void;
  onConfirm: (input: { projectName?: string }) => void;
  open: boolean;
};

export function SendToProjectDialog({ onClose, onConfirm, open }: Props) {
  const [projectName, setProjectName] = React.useState("工作台结果");
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/55 p-4">
      <section className="w-full max-w-[420px] rounded-[22px] border border-white/10 bg-[#101014] p-5 text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <div className="text-base font-black">发送到画布</div>
        <label className="mt-4 grid gap-2">
          <span className="text-xs font-bold text-slate-400">新项目名称</span>
          <input
            className="h-11 rounded-xl border border-white/10 bg-black/20 px-3 text-sm outline-none"
            onChange={(event) => setProjectName(event.target.value)}
            value={projectName}
          />
        </label>
        <div className="mt-5 flex justify-end gap-3">
          <button className="h-10 rounded-full px-4 text-sm text-slate-300" onClick={onClose} type="button">
            取消
          </button>
          <button
            className="h-10 rounded-full bg-white px-5 text-sm font-black text-black"
            onClick={() => onConfirm({ projectName })}
            type="button"
          >
            确认
          </button>
        </div>
      </section>
    </div>
  );
}
