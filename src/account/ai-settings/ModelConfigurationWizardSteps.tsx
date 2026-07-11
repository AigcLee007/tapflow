import React from "react";
import { KeyRound, Link, PackagePlus, Route, WalletCards } from "lucide-react";

import { MenuSelect } from "../../components/menu/MenuSelect";
import type { AdminCredential, AdminProvider, AdminProviderConnection } from "../../services/v2AiGatewayAdminApi";
import type { AiPluginSummary } from "../../services/v2AiPluginAdminApi";
import type { ModelConfigurationCustomDefinition } from "../../services/v2AiModelConfigurationsApi";
import { createBuiltinWizardState, createCustomWizardState, pricingUnitForModality, type ModelConfigurationWizardState, type WizardStep } from "./modelConfigurationWizardState";

export type WizardStepProps = {
  connections: AdminProviderConnection[];
  credentials: AdminCredential[];
  onChange: (state: ModelConfigurationWizardState) => void;
  plugins: AiPluginSummary[];
  providers: AdminProvider[];
  state: ModelConfigurationWizardState;
  step: WizardStep;
};

const inputClass = "h-10 w-full rounded border border-white/10 bg-black/25 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300/50";
const segmentClass = "h-9 rounded px-3 text-xs font-bold";

function updateCustom(state: ModelConfigurationWizardState, patch: Partial<ModelConfigurationCustomDefinition["model"]> | Partial<ModelConfigurationCustomDefinition["provider"]>, section: "model" | "provider") {
  if (state.modelSource.type !== "custom") return state;
  return { ...state, modelSource: { type: "custom", custom: { ...state.modelSource.custom, [section]: { ...state.modelSource.custom[section], ...patch } } } };
}

export function ModelConfigurationWizardSteps({ connections, credentials, onChange, plugins, providers, state, step }: WizardStepProps) {
  if (step === "model") {
    const builtinModels = plugins.flatMap((plugin) => plugin.models.map((model) => ({ ...model, packageKey: plugin.packageKey, provider: plugin.provider, modality: plugin.modality })));
    return <section className="space-y-4" aria-label="模型">
      <div className="grid gap-2 sm:grid-cols-2">
        {builtinModels.map((model) => <button key={`${model.packageKey}:${model.modelKey}`} className="rounded border border-white/10 bg-white/[0.03] p-3 text-left hover:border-sky-300/50" onClick={() => onChange(createBuiltinWizardState({ displayName: model.displayName, modality: model.modality, modelFamily: model.modelFamily, modelKey: model.modelKey, packageKey: model.packageKey, provider: model.provider }))} type="button"><PackagePlus className="mb-2 text-sky-200" size={18} /><span className="block text-sm font-bold text-white">{model.displayName}</span><span className="text-xs text-slate-400">{model.modelKey}</span></button>)}
        <button className="rounded border border-dashed border-white/20 p-3 text-left hover:border-sky-300/50" onClick={() => onChange(createCustomWizardState({ model: { displayName: "", modality: "image", modelFamily: "", modelKey: "" }, provider: { key: "", kind: "openai-compatible", name: "" }, routeDefaults: {} }))} type="button"><PackagePlus className="mb-2 text-sky-200" size={18} /><span className="block text-sm font-bold text-white">自定义 OpenAI 兼容模型</span></button>
      </div>
      {state.modelSource.type === "custom" ? <div className="grid gap-3 sm:grid-cols-2">
        <Field label="提供商标识" value={state.modelSource.custom.provider.key} onChange={(value) => onChange(updateCustom(state, { key: value }, "provider"))} />
        <Field label="提供商名称" value={state.modelSource.custom.provider.name} onChange={(value) => onChange(updateCustom(state, { name: value }, "provider"))} />
        <Field label="模型名称" value={state.modelSource.custom.model.displayName} onChange={(value) => onChange(updateCustom(state, { displayName: value }, "model"))} />
        <Field label="模型标识" value={state.modelSource.custom.model.modelKey} onChange={(value) => onChange(updateCustom(state, { modelKey: value }, "model"))} />
        <Field label="模型系列" value={state.modelSource.custom.model.modelFamily} onChange={(value) => onChange(updateCustom(state, { modelFamily: value }, "model"))} />
        <div><label className="mb-1 block text-xs font-bold text-slate-300">类型</label><MenuSelect fullWidth label="类型" onChange={(value) => onChange(updateCustom(state, { modality: value as "image" | "text" | "video" }, "model"))} options={[{ label: "生图", value: "image" }, { label: "文本", value: "text" }, { label: "视频", value: "video" }]} value={state.modelSource.custom.model.modality} /></div>
      </div> : null}
    </section>;
  }
  if (step === "connection") {
    const providerKey = state.modelSource.type === "builtin" ? state.modelSource.provider?.key : state.modelSource.type === "custom" ? state.modelSource.custom.provider.key : "";
    const matching = connections.filter((connection) => !providerKey || connection.adapterKind === providerKey || connection.metadata.providerKey === providerKey);
    return <section className="space-y-4" aria-label="连接"><div className="flex gap-2"><button className={`${segmentClass} ${state.connection.mode === "create" ? "bg-sky-400 text-black" : "bg-white/10 text-white"}`} onClick={() => onChange({ ...state, connection: { baseUrl: "", environment: "production", mode: "create", name: "" } })} type="button">新建连接</button><button className={`${segmentClass} ${state.connection.mode === "existing" ? "bg-sky-400 text-black" : "bg-white/10 text-white"}`} onClick={() => onChange({ ...state, connection: { connectionId: matching[0]?.id ?? "", mode: "existing" } })} type="button">使用已有连接</button></div>{state.connection.mode === "create" ? <div className="grid gap-3 sm:grid-cols-2"><Field label="连接名称" value={state.connection.name} onChange={(name) => onChange({ ...state, connection: { ...state.connection, name } })} /><Field label="基础 URL" value={state.connection.baseUrl} onChange={(baseUrl) => onChange({ ...state, connection: { ...state.connection, baseUrl } })} /></div> : <Choice label="现有连接" options={matching.map((item) => ({ label: item.name, value: item.id }))} value={state.connection.connectionId} onChange={(connectionId) => onChange({ ...state, connection: { connectionId, mode: "existing" } })} />}</section>;
  }
  if (step === "routeCredential") {
    const providerKey = state.modelSource.type === "builtin" ? state.modelSource.provider?.key : state.modelSource.type === "custom" ? state.modelSource.custom.provider.key : "";
    const providerId = providers.find((provider) => provider.key === providerKey)?.id ?? state.saved?.credential.providerId;
    const safeCredentials = providerId ? credentials.filter((credential) => credential.providerId === providerId) : [];
    return <section className="space-y-4" aria-label="线路和密钥"><div className="grid gap-3 sm:grid-cols-2"><Field label="线路名称" value={state.route.routeLabel} onChange={(routeLabel) => onChange({ ...state, route: { ...state.route, routeLabel } })} /><Field label="上游模型" value={state.route.upstreamModel} onChange={(upstreamModel) => onChange({ ...state, route: { ...state.route, upstreamModel } })} /></div><div className="flex gap-2"><button className={`${segmentClass} ${state.credential.mode === "create" ? "bg-sky-400 text-black" : "bg-white/10 text-white"}`} onClick={() => onChange({ ...state, credential: { mode: "create", name: "", secret: "" } })} type="button">新建密钥</button><button className={`${segmentClass} ${state.credential.mode === "existing" ? "bg-sky-400 text-black" : "bg-white/10 text-white"}`} onClick={() => onChange({ ...state, credential: { credentialId: safeCredentials[0]?.id ?? "", mode: "existing" } })} type="button">使用已有密钥</button></div>{state.credential.mode === "create" ? <div className="grid gap-3 sm:grid-cols-2"><Field label="密钥名称" value={state.credential.name} onChange={(name) => onChange({ ...state, credential: { ...state.credential, name } })} /><Field label="API 密钥" secret value={state.credential.secret} onChange={(secret) => onChange({ ...state, credential: { ...state.credential, secret } })} /></div> : state.credential.mode === "existing" ? <Choice label="现有密钥" options={safeCredentials.map((item) => ({ label: `${item.name} · ${item.secretFingerprint} · ${item.status}`, value: item.id }))} value={state.credential.credentialId} onChange={(credentialId) => onChange({ ...state, credential: { credentialId, mode: "existing" } })} /> : null}<details><summary className="cursor-pointer text-xs font-bold text-slate-300">高级配置</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="线路标识" value={state.route.routeKey ?? ""} onChange={(routeKey) => onChange({ ...state, route: { ...state.route, routeKey } })} /><Field label="API 模式" value={state.route.apiMode ?? ""} onChange={(apiMode) => onChange({ ...state, route: { ...state.route, apiMode } })} /><Field label="请求路径" value={state.route.requestPath ?? ""} onChange={(requestPath) => onChange({ ...state, route: { ...state.route, requestPath } })} /><Field label="超时毫秒" value={String(state.route.timeoutMs ?? "")} onChange={(value) => onChange({ ...state, route: { ...state.route, timeoutMs: value ? Number(value) : undefined } })} /><Field label="优先级" value={String(state.route.priority ?? "")} onChange={(value) => onChange({ ...state, route: { ...state.route, priority: value ? Number(value) : undefined } })} /><Field label="权重" value={String(state.route.weight ?? "")} onChange={(value) => onChange({ ...state, route: { ...state.route, weight: value ? Number(value) : undefined } })} /><Field label="回退组" value={state.route.fallbackGroup ?? ""} onChange={(fallbackGroup) => onChange({ ...state, route: { ...state.route, fallbackGroup } })} /><Field label="请求配置 JSON" value={state.route.requestConfig ? JSON.stringify(state.route.requestConfig) : ""} onChange={(value) => { try { onChange({ ...state, route: { ...state.route, requestConfig: value ? JSON.parse(value) : undefined } }); } catch {} }} /></div></details></section>;
  }
  if (step === "pricing") return <section className="grid gap-3 sm:grid-cols-2" aria-label="定价"><Field label="单价积分" value={String(state.pricing.unitCredits ?? "")} onChange={(value) => onChange({ ...state, pricing: { ...state.pricing, unitCredits: Number(value) } })} /><Field label="最低积分" value={String(state.pricing.minChargeCredits ?? "")} onChange={(value) => onChange({ ...state, pricing: { ...state.pricing, minChargeCredits: Number(value) } })} /><div><label className="mb-1 block text-xs font-bold text-slate-300">计费单位</label><MenuSelect fullWidth label="计费单位" onChange={(unit) => onChange({ ...state, pricing: { ...state.pricing, unit: unit as typeof state.pricing.unit } })} options={[{ label: "文本生成", value: "text_generation" }, { label: "生图生成", value: "image_generation" }, { label: "视频生成", value: "video_generation" }]} value={state.pricing.unit ?? pricingUnitForModality(state.modelSource.type === "custom" ? state.modelSource.custom.model.modality : state.modelSource.type === "builtin" ? state.modelSource.modality : "image")} /></div></section>;
  return <section className="space-y-3" aria-label="测试和发布"><div className="flex items-center gap-2 text-sm text-slate-200"><Route size={17} />当前草稿需要完成线路测试</div><div className="flex items-center gap-2 text-sm text-slate-200"><KeyRound size={17} />凭据仅显示安全元数据</div><div className="flex items-center gap-2 text-sm text-slate-200"><WalletCards size={17} />发布后配置将可用于产品模型</div></section>;
}

function Field({ label, onChange, secret = false, value }: { label: string; onChange: (value: string) => void; secret?: boolean; value: string }) { return <label className="block text-xs font-bold text-slate-300">{label}<input aria-label={label} className={`${inputClass} mt-1`} onChange={(event) => onChange(event.target.value)} type={secret ? "password" : "text"} value={value} /></label>; }
function Choice({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: Array<{ label: string; value: string }>; value: string }) { return <div><label className="mb-1 block text-xs font-bold text-slate-300">{label}</label><MenuSelect disabled={!options.length} fullWidth label={label} onChange={onChange} options={options.length ? options : [{ label: "暂无可用项", value: "" }]} value={value} /></div>; }
