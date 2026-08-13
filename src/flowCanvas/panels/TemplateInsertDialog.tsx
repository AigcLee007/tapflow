import React, { useEffect, useMemo, useState } from 'react';

import { MenuSelect } from '../../components/menu/MenuSelect';
import { MenuSurface } from '../../components/menu/MenuSurface';
import { MENU_ITEM_CLASS, MENU_ITEM_PRIMARY_CLASS } from '../../components/menu/menuStyles';
import { useDismissibleLayer } from '../../components/menu/useDismissibleLayer';
import { listAssets, type AssetItem } from '../../assets/assetApi';
import type { FlowTemplateGraph, FlowTemplateInputDefinition } from '../../services/v2FlowTemplatesApi';

type AssetOption = { id: string; filename?: string; name?: string };
type Values = Record<string, string | number | undefined>;

function defaultValues(inputs: FlowTemplateInputDefinition[]): Values {
  return Object.fromEntries(inputs.flatMap((input) => {
    const value = input.defaultValue ?? (input.type === 'enum' ? input.options[0] : undefined);
    return value === undefined ? [] : [[input.id, value]];
  }));
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
  if (input.type === 'asset') return <label className="block text-xs font-bold text-slate-300">{label}<div className="mt-2"><TemplateAssetPicker assetKinds={input.assetKinds} assetOptions={assetOptions} label={input.label} onChange={onChange} value={String(value ?? '')} /></div></label>;
  if (input.type === 'number') return <label className="block text-xs font-bold text-slate-300">{label}<input aria-label={input.label} className="mt-2 h-[38px] w-full rounded-[10px] border border-white/10 bg-black/25 px-3 text-sm text-white" max={input.maximum} min={input.minimum} onChange={(event) => onChange(Number(event.target.value))} step={input.step} type="number" value={value ?? ''} /></label>;
  return <label className="block text-xs font-bold text-slate-300">{label}<textarea aria-label={input.label} className="mt-2 min-h-[76px] w-full rounded-[10px] border border-white/10 bg-black/25 p-3 text-sm text-white" onChange={(event) => onChange(event.target.value)} value={value ?? ''} /></label>;
}

function TemplateAssetPicker({ assetKinds = ['image', 'video', 'audio'], assetOptions, label, onChange, value }: { assetKinds?: Array<'image' | 'video' | 'audio'>; assetOptions: AssetOption[]; label: string; onChange: (value: string) => void; value: string }) {
  const layer = useDismissibleLayer(`template-assets-${label}`);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [total, setTotal] = useState(0);
  const kind = assetKinds.length === 1 ? assetKinds[0] : undefined;
  useEffect(() => {
    if (!layer.open || assetOptions.length) return;
    let cancelled = false;
    void listAssets({ includePreviewUrls: false, kind, page, pageSize: 20, query: query || undefined }).then((result) => {
      if (!cancelled) { setAssets(result.items.filter((asset) => assetKinds.includes(asset.kind as 'image' | 'video' | 'audio'))); setTotal(result.total); }
    }).catch(() => { if (!cancelled) { setAssets([]); setTotal(0); } });
    return () => { cancelled = true; };
  }, [assetKinds, assetOptions.length, kind, layer.open, page, query]);
  const options = assetOptions.length ? assetOptions.map((asset) => ({ id: asset.id, label: asset.filename || asset.name || asset.id })) : assets.map((asset) => ({ id: asset.id, label: asset.originalFilename || asset.title || asset.id }));
  const selected = options.find((asset) => asset.id === value);
  const totalPages = Math.max(1, Math.ceil(total / 20));
  return <div className="relative w-full">
    <button ref={layer.triggerRef as React.RefObject<HTMLButtonElement>} aria-expanded={layer.open} aria-haspopup="menu" aria-label={`${label} ${selected?.label ?? '选择素材'}`} className="inline-flex h-[38px] w-full items-center justify-between rounded-[10px] border border-white/10 bg-[#17171b] px-2 text-xs font-bold text-white" onClick={layer.toggle} type="button">{selected?.label ?? '选择素材'}</button>
    {layer.open ? <MenuSurface ref={layer.ref as React.RefObject<HTMLDivElement>} className="absolute left-0 top-[calc(100%+12px)] z-[1200] w-full min-w-[260px] p-2" role="menu">
      {!assetOptions.length ? <><input aria-label="Search assets" className="mb-2 h-[38px] w-full rounded-[10px] border border-white/10 bg-black/25 px-2 text-xs text-white" onChange={(event) => { setPage(1); setQuery(event.target.value); }} value={query} /></> : null}
      <button className={`${MENU_ITEM_CLASS} h-[38px]`} onClick={() => { onChange(''); layer.closeLayer(); }} role="menuitem" type="button"><span className={MENU_ITEM_PRIMARY_CLASS}>选择素材</span></button>
      {options.map((asset) => <button className={`${MENU_ITEM_CLASS} h-[38px]`} key={asset.id} onClick={() => { onChange(asset.id); layer.closeLayer(); }} role="menuitem" type="button"><span className={MENU_ITEM_PRIMARY_CLASS}>{asset.label}</span></button>)}
      {!assetOptions.length && totalPages > 1 ? <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400"><button aria-label="Previous asset page" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} type="button">上一页</button><span>{page} / {totalPages}</span><button aria-label="Next asset page" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} type="button">下一页</button></div> : null}
    </MenuSurface> : null}
  </div>;
}
