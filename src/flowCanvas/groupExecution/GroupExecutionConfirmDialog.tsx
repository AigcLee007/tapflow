import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

import type { GroupExecutionPlan } from './groupExecutionPlan';

export function GroupExecutionConfirmDialog({
  open,
  plan,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  plan: GroupExecutionPlan | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, open]);

  if (!open || !plan) return null;
  const isBlocked = plan.blockingIssues.length > 0;
  const dialog = (
    <div className="fixed inset-0 z-[2200] grid place-items-center bg-black/60 px-4 backdrop-blur-sm" onMouseDown={onCancel}>
      <section aria-label="Confirm group execution" aria-modal="true" className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1c1c20] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.52)]" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <h2 className="text-base font-bold text-white">Confirm group execution</h2>
        <p className="mt-2 text-xs leading-5 text-white/60">{plan.nodeIds.length} executable nodes across {plan.layers.length} dependency layers.</p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-[10px] bg-white/[0.06] p-3"><span className="block text-[9px] font-bold text-white/45">NODES</span><span className="mt-1 block font-bold text-white">{plan.nodeIds.length} executable nodes</span></div>
          <div className="rounded-[10px] bg-white/[0.06] p-3"><span className="block text-[9px] font-bold text-white/45">ESTIMATED CREDITS</span><span className="mt-1 block font-bold text-white">{plan.estimatedCredits}</span></div>
        </div>
        <div className="mt-4 text-xs text-white/65">External inputs: {plan.externalDependencies.length === 0 ? 'No external inputs' : `${plan.externalDependencies.filter((item) => item.satisfied).length}/${plan.externalDependencies.length} ready`}</div>
        {isBlocked ? <div className="mt-4 rounded-[10px] border border-red-400/25 bg-red-500/10 p-3 text-xs text-red-200">{plan.blockingIssues.map((issue) => <p key={`${issue.code}:${issue.nodeId ?? ''}`}>{issue.message}</p>)}</div> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button className="h-[38px] rounded-[10px] border border-white/10 px-3 text-xs font-bold text-white hover:bg-white/[0.06]" onClick={onCancel} type="button">Cancel</button>
          <button className="h-[38px] rounded-[10px] bg-white px-3 text-xs font-bold text-black hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-45" disabled={isBlocked} onClick={onConfirm} type="button">Start execution</button>
        </div>
      </section>
    </div>
  );
  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
}
