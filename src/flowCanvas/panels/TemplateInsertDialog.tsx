import React, { useEffect, useMemo, useState } from 'react';

import { MenuSelect } from '../../components/menu/MenuSelect';
import type { FlowTemplateGraph, FlowTemplateInputDefinition } from '../../services/v2FlowTemplatesApi';

type AssetOption = { id: string; filename?: string; name?: string };
type Values = Record<string, string | number | undefined>;

function defaultValues(inputs: FlowTemplateInputDefinition[]): Values {
  return Object.fromEntries(inputs.flatMap((input) => input.defaultValue === undefined ? [] : [[input.id, input.defaultValue]]));
}

export function TemplateInsertDialog({
  assets = [], onCancel, onConfirm, open, template,
}: {
  assets?: AssetOption[];
  onCancel: () => void;
  onConfirm: (values: Values) => void;
  open: boolean;
  template: Pick<FlowTemplateGraph, 'id' | 'title' | 'inputSchema'> | null;
}) {
  const inputs = useMemo(() => template?.inputSchema ?? [], [template]);
  const [values, setValues] = useState<Values>(() => defaultValues(inputs));

  useEffect(() => setValues(defaultValues(inputs)), [inputs]);
  if (!open || !template) return null;
  const incomplete = inputs.some((input) => input.required && (values[input.id] === undefined || values[input.id] === ''));
  const setValue = (id: string, value: string | number) => setValues((current) => ({ ...current, [id]: value }));

  return <div aria-modal="true" className="fixed inset-0 z-[1300] grid place-items-center bg-black/60 p-4" role="dialog">
    <div className="w-full max-w-[460px] rounded-[8px] border border-white/10 bg-[#18181d] p-5 shadow-2xl">
      <h2 className="text-base font-bold text-white">配置模板输入</h2>
      <p className="mt-1 text-xs text-slate-400">{template.title}</p>
      <div className="mt-5 space-y-4">
        {inputs.map((input) => <TemplateInputField assetOptions={assets} input={input} key={input.id} onChange={(value) => setValue(input.id, value)} value={values[input.id]} />)}
      </div>
      <div className="mt-6 flex justify-end gap-2"><button className="h-[38px] rounded-[10px] px-3 text-xs font-bold text-slate-300 hover:bg-white/10" onClick={onCancel} type="button">取消</button><button className="h-[38px] rounded-[10px] bg-cyan-300 px-3 text-xs font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50" disabled={incomplete} onClick={() => onConfirm(values)} type="button">插入模板</button></div>
    </div>
  </div>;
}

function TemplateInputField({ assetOptions, input, onChange, value }: { assetOptions: AssetOption[]; input: FlowTemplateInputDefinition; onChange: (value: string | number) => void; value: string | number | undefined }) {
  const label = `${input.label}${input.required ? ' *' : ''}`;
  if (input.type === 'enum') return <label className="block text-xs font-bold text-slate-300">{label}<div className="mt-2"><MenuSelect fullWidth label={input.label} onChange={onChange} options={input.options.map((option) => ({ label: option, value: option }))} value={String(value ?? input.options[0] ?? '')} /></div></label>;
  if (input.type === 'asset') return <label className="block text-xs font-bold text-slate-300">{label}<div className="mt-2"><MenuSelect fullWidth label={input.label} onChange={onChange} options={[{ label: '选择素材', value: '' }, ...assetOptions.map((asset) => ({ label: asset.filename || asset.name || asset.id, value: asset.id }))]} value={String(value ?? '')} /></div></label>;
  if (input.type === 'number') return <label className="block text-xs font-bold text-slate-300">{label}<input aria-label={input.label} className="mt-2 h-[38px] w-full rounded-[10px] border border-white/10 bg-black/25 px-3 text-sm text-white" max={input.maximum} min={input.minimum} onChange={(event) => onChange(Number(event.target.value))} step={input.step} type="number" value={value ?? ''} /></label>;
  return <label className="block text-xs font-bold text-slate-300">{label}<textarea aria-label={input.label} className="mt-2 min-h-[76px] w-full rounded-[10px] border border-white/10 bg-black/25 p-3 text-sm text-white" onChange={(event) => onChange(event.target.value)} value={value ?? ''} /></label>;
}
