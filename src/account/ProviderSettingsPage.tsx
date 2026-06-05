import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, KeyRound, Loader2, Plus, RefreshCw, Save, Settings2 } from "lucide-react";

import { ACCOUNT_ROUTE } from "../app/routes";
import { useAuth } from "../auth/useAuth";
import {
  createAdminCredential,
  createAdminModel,
  createAdminProvider,
  createAdminRoute,
  listAdminCredentials,
  listAdminModels,
  listAdminPricing,
  listAdminProviders,
  listAdminRoutes,
  rotateAdminCredential,
  type AdminCredential,
  type AdminModel,
  type AdminProvider,
  type AdminRoute,
  type AiModality,
  type ModelPricingRow,
  type PricingUnit,
  updateAdminRoute,
  upsertAdminPricing,
} from "../services/v2AiGatewayAdminApi";

type LoadState = "idle" | "loading" | "error" | "ready";

type ProviderForm = {
  defaultBaseUrl: string;
  key: string;
  kind: string;
  name: string;
};

type CredentialForm = {
  name: string;
  providerId: string;
  secret: string;
};

type BundleForm = {
  baseUrlOverride: string;
  credentialId: string;
  displayName: string;
  minChargeCredits: string;
  modality: AiModality;
  modelKey: string;
  providerId: string;
  routeKey: string;
  timeoutMs: string;
  unitCredits: string;
};

const MODALITY_OPTIONS: Array<{
  label: string;
  value: AiModality;
  unit: PricingUnit;
  routePrefix: string;
}> = [
  { label: "文本", routePrefix: "text", unit: "text_generation", value: "text" },
  { label: "生图", routePrefix: "image", unit: "image_generation", value: "image" },
  { label: "视频", routePrefix: "video", unit: "video_generation", value: "video" },
];

const inputClass =
  "h-10 w-full rounded border border-white/10 bg-black/25 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300/50";
const selectClass =
  "h-10 w-full rounded border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-sky-300/50";
const labelClass = "mb-1.5 block text-xs font-medium text-slate-400";

function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function statusLabel(status?: string | null) {
  if (status === "active") return "启用";
  if (status === "inactive") return "停用";
  if (status === "disabled") return "已禁用";
  return status || "-";
}

function modalityLabel(modality?: string | null) {
  return MODALITY_OPTIONS.find((item) => item.value === modality)?.label ?? modality ?? "-";
}

function pricingUnitFor(modality: AiModality): PricingUnit {
  return MODALITY_OPTIONS.find((item) => item.value === modality)?.unit ?? "image_generation";
}

function asTimeoutMs(requestConfig: Record<string, unknown> | undefined): number {
  const value = requestConfig?.timeoutMs;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  return 300000;
}

function providerName(providers: AdminProvider[], providerId?: string | null) {
  const provider = providers.find((item) => item.id === providerId);
  return provider ? `${provider.name} (${provider.key})` : "-";
}

function modelName(models: AdminModel[], modelId?: string | null) {
  const model = models.find((item) => item.id === modelId);
  return model ? `${model.displayName} (${model.modelKey})` : "未绑定模型";
}

function credentialName(credentials: AdminCredential[], credentialId?: string | null) {
  const credential = credentials.find((item) => item.id === credentialId);
  return credential ? `${credential.name} ${credential.maskedSecret}` : "未绑定凭证";
}

function findPricing(
  pricing: ModelPricingRow[],
  provider: AdminProvider | null,
  model: AdminModel | null,
  route: AdminRoute | null,
) {
  if (!provider || !model || !route) return null;
  const unit = pricingUnitFor(route.modality);
  return (
    pricing.find(
      (item) =>
        item.provider === provider.key &&
        item.model === model.modelKey &&
        item.route === route.routeKey &&
        item.unit === unit,
    ) ?? null
  );
}

function SectionCard({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="rounded border border-white/10 bg-white/[0.04] p-5">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

export function ProviderSettingsPage() {
  const { permissions } = useAuth();
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);

  const [providers, setProviders] = useState<AdminProvider[]>([]);
  const [models, setModels] = useState<AdminModel[]>([]);
  const [routes, setRoutes] = useState<AdminRoute[]>([]);
  const [credentials, setCredentials] = useState<AdminCredential[]>([]);
  const [pricing, setPricing] = useState<ModelPricingRow[]>([]);

  const [activeModality, setActiveModality] = useState<AiModality>("image");
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [routeBaseUrlOverride, setRouteBaseUrlOverride] = useState("");
  const [routeModelId, setRouteModelId] = useState("");
  const [routeCredentialId, setRouteCredentialId] = useState("");
  const [routeTimeoutMs, setRouteTimeoutMs] = useState("300000");
  const [routeStatus, setRouteStatus] = useState<"active" | "inactive">("active");
  const [routeMinChargeCredits, setRouteMinChargeCredits] = useState("100");
  const [routeUnitCredits, setRouteUnitCredits] = useState("100");

  const [providerForm, setProviderForm] = useState<ProviderForm>({
    defaultBaseUrl: "https://api.openai.com/v1",
    key: "openai-compatible",
    kind: "openai-compatible",
    name: "OpenAI 兼容服务商",
  });
  const [credentialForm, setCredentialForm] = useState<CredentialForm>({
    name: "默认 API Key",
    providerId: "",
    secret: "",
  });
  const [bundleForm, setBundleForm] = useState<BundleForm>({
    baseUrlOverride: "",
    credentialId: "",
    displayName: "",
    minChargeCredits: "100",
    modality: "image",
    modelKey: "",
    providerId: "",
    routeKey: "image.openai",
    timeoutMs: "300000",
    unitCredits: "100",
  });
  const [rotateCredentialId, setRotateCredentialId] = useState("");
  const [rotateSecret, setRotateSecret] = useState("");

  const canRead =
    permissions.includes("provider:read") ||
    permissions.includes("provider:manage") ||
    permissions.includes("credential:manage");
  const canManage = permissions.includes("provider:manage");
  const canManageCredentials = permissions.includes("credential:manage");

  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId) ?? null,
    [routes, selectedRouteId],
  );
  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedRoute?.providerId) ?? null,
    [providers, selectedRoute?.providerId],
  );
  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedRoute?.modelId) ?? null,
    [models, selectedRoute?.modelId],
  );
  const selectedPricing = useMemo(
    () => findPricing(pricing, selectedProvider, selectedModel, selectedRoute),
    [pricing, selectedModel, selectedProvider, selectedRoute],
  );
  const visibleRoutes = useMemo(
    () => routes.filter((route) => route.modality === activeModality),
    [activeModality, routes],
  );
  const visibleModels = useMemo(
    () => models.filter((model) => model.modality === activeModality),
    [activeModality, models],
  );
  const providerCredentials = useMemo(
    () => credentials.filter((item) => item.providerId === (bundleForm.providerId || selectedRoute?.providerId)),
    [bundleForm.providerId, credentials, selectedRoute?.providerId],
  );
  const selectedRouteIsTenantOwned = Boolean(selectedRoute?.tenantId);

  const refresh = useCallback(async () => {
    if (!canRead) {
      setState("error");
      setError("当前账号没有访问模型管理的权限。");
      return;
    }
    setState("loading");
    setError("");
    try {
      const [nextProviders, nextModels, nextRoutes, nextCredentials, nextPricing] = await Promise.all([
        listAdminProviders(),
        listAdminModels(),
        listAdminRoutes(),
        listAdminCredentials(),
        listAdminPricing(),
      ]);
      setProviders(nextProviders);
      setModels(nextModels);
      setRoutes(nextRoutes);
      setCredentials(nextCredentials);
      setPricing(nextPricing);

      const firstProviderId = nextProviders[0]?.id ?? "";
      setCredentialForm((current) => ({
        ...current,
        providerId: current.providerId || firstProviderId,
      }));
      setBundleForm((current) => ({
        ...current,
        credentialId: current.credentialId || nextCredentials.find((item) => item.providerId === (current.providerId || firstProviderId))?.id || "",
        providerId: current.providerId || firstProviderId,
      }));
      setRotateCredentialId((current) => current || nextCredentials[0]?.id || "");

      const nextSelected =
        nextRoutes.find((item) => item.id === selectedRouteId) ??
        nextRoutes.find((item) => item.modality === activeModality && item.tenantId) ??
        nextRoutes.find((item) => item.modality === activeModality) ??
        nextRoutes[0] ??
        null;
      setSelectedRouteId(nextSelected?.id ?? "");
      setState("ready");
    } catch (cause) {
      setState("error");
      setError(cause instanceof Error ? cause.message : "模型管理数据加载失败。");
    }
  }, [activeModality, canRead, selectedRouteId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedRoute) return;
    const nextPricing = findPricing(pricing, selectedProvider, selectedModel, selectedRoute);
    setRouteBaseUrlOverride(selectedRoute.baseUrlOverride ?? "");
    setRouteModelId(selectedRoute.modelId ?? "");
    setRouteCredentialId(selectedRoute.credentialId ?? "");
    setRouteTimeoutMs(String(asTimeoutMs(selectedRoute.requestConfig)));
    setRouteStatus(selectedRoute.status === "inactive" ? "inactive" : "active");
    setRouteMinChargeCredits(String(nextPricing?.minChargeCredits ?? 100));
    setRouteUnitCredits(String(nextPricing?.unitCredits ?? nextPricing?.minChargeCredits ?? 100));
  }, [pricing, selectedModel, selectedProvider, selectedRoute]);

  useEffect(() => {
    const option = MODALITY_OPTIONS.find((item) => item.value === bundleForm.modality);
    if (!option) return;
    setBundleForm((current) => ({
      ...current,
      routeKey:
        current.routeKey && current.routeKey.startsWith(`${option.routePrefix}.`)
          ? current.routeKey
          : `${option.routePrefix}.`,
    }));
  }, [bundleForm.modality]);

  async function handleCreateProvider() {
    if (!providerForm.key.trim() || !providerForm.name.trim() || !providerForm.kind.trim()) {
      setError("请填写服务商 Key、名称和适配器类型。");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const provider = await createAdminProvider({
        defaultBaseUrl: providerForm.defaultBaseUrl.trim() || null,
        key: providerForm.key.trim(),
        kind: providerForm.kind.trim(),
        name: providerForm.name.trim(),
        status: "active",
      });
      setMessage(`服务商已创建：${provider.name}`);
      setCredentialForm((current) => ({ ...current, providerId: provider.id }));
      setBundleForm((current) => ({ ...current, providerId: provider.id }));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建服务商失败。");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateCredential() {
    if (!credentialForm.providerId || !credentialForm.name.trim() || !credentialForm.secret.trim()) {
      setError("请选择服务商，并填写凭证名称和 API Key。");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const credential = await createAdminCredential({
        name: credentialForm.name.trim(),
        providerId: credentialForm.providerId,
        secret: credentialForm.secret.trim(),
        status: "active",
      });
      setCredentialForm((current) => ({ ...current, secret: "" }));
      setBundleForm((current) => ({
        ...current,
        credentialId: credential.id,
        providerId: credential.providerId,
      }));
      setRotateCredentialId(credential.id);
      setMessage(`凭证已创建：${credential.name}`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建凭证失败。");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateModelRoutePricing() {
    const provider = providers.find((item) => item.id === bundleForm.providerId);
    if (!provider) {
      setError("请先选择服务商。");
      return;
    }
    if (!bundleForm.modelKey.trim() || !bundleForm.displayName.trim() || !bundleForm.routeKey.trim()) {
      setError("请填写模型 ID、显示名称和线路 Key。");
      return;
    }
    const minChargeCredits = Math.max(1, Number.parseInt(bundleForm.minChargeCredits, 10) || 1);
    const unitCredits = Math.max(1, Number.parseInt(bundleForm.unitCredits, 10) || minChargeCredits);
    const timeoutMs = Math.max(1000, Number.parseInt(bundleForm.timeoutMs, 10) || 300000);

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const model = await createAdminModel({
        displayName: bundleForm.displayName.trim(),
        modality: bundleForm.modality,
        modelKey: bundleForm.modelKey.trim(),
        providerId: provider.id,
        status: "active",
      });
      const route = await createAdminRoute({
        baseUrlOverride: bundleForm.baseUrlOverride.trim() || null,
        credentialId: bundleForm.credentialId || null,
        modality: bundleForm.modality,
        modelId: model.id,
        providerId: provider.id,
        requestConfig: { timeoutMs },
        routeKey: bundleForm.routeKey.trim(),
        status: "active",
      });
      await upsertAdminPricing({
        active: true,
        minChargeCredits,
        model: model.modelKey,
        provider: provider.key,
        route: route.routeKey,
        unit: pricingUnitFor(bundleForm.modality),
        unitCredits,
      });
      setActiveModality(bundleForm.modality);
      setSelectedRouteId(route.id);
      setBundleForm((current) => ({
        ...current,
        displayName: "",
        modelKey: "",
        routeKey: `${MODALITY_OPTIONS.find((item) => item.value === current.modality)?.routePrefix ?? "image"}.`,
      }));
      setMessage(`模型和线路已创建：${model.displayName}`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建模型线路失败。");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveRoute() {
    if (!selectedRoute || !selectedProvider) return;
    if (!selectedRouteIsTenantOwned) {
      setError("系统默认线路是只读的。请新增一条当前工作区线路后再编辑。");
      return;
    }
    const model = models.find((item) => item.id === routeModelId);
    if (!model) {
      setError("请选择有效模型。");
      return;
    }
    const minChargeCredits = Math.max(1, Number.parseInt(routeMinChargeCredits, 10) || 1);
    const unitCredits = Math.max(1, Number.parseInt(routeUnitCredits, 10) || minChargeCredits);
    const timeoutMs = Math.max(1000, Number.parseInt(routeTimeoutMs, 10) || 300000);

    setSaving(true);
    setError("");
    setMessage("");
    try {
      await updateAdminRoute(selectedRoute.id, {
        baseUrlOverride: routeBaseUrlOverride.trim() || null,
        credentialId: routeCredentialId || null,
        modelId: model.id,
        requestConfig: {
          ...(selectedRoute.requestConfig ?? {}),
          timeoutMs,
        },
        status: routeStatus,
      });
      await upsertAdminPricing({
        active: true,
        minChargeCredits,
        model: model.modelKey,
        provider: selectedProvider.key,
        route: selectedRoute.routeKey,
        unit: pricingUnitFor(selectedRoute.modality),
        unitCredits,
      });
      setMessage(`线路已保存：${selectedRoute.routeKey}`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存线路失败。");
    } finally {
      setSaving(false);
    }
  }

  async function handleRotateCredential() {
    if (!rotateCredentialId || !rotateSecret.trim()) {
      setError("请选择凭证并输入新的 API Key。");
      return;
    }
    setRotating(true);
    setError("");
    setMessage("");
    try {
      const credential = await rotateAdminCredential(rotateCredentialId, rotateSecret.trim());
      setRotateSecret("");
      setMessage(`凭证已更新：${credential.name}`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新凭证失败。");
    } finally {
      setRotating(false);
    }
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-sky-300">模型管理</div>
          <h1 className="mt-2 text-2xl font-semibold text-white">模型与线路管理</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            在这里维护服务商、API Key、文本模型、生图模型、视频模型、调用线路和扣费价格。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex h-10 items-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15"
            onClick={() => navigate(ACCOUNT_ROUTE)}
            type="button"
          >
            <ArrowLeft size={15} />
            返回账号中心
          </button>
          <button
            className="inline-flex h-10 items-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15"
            onClick={() => void refresh()}
            type="button"
          >
            <RefreshCw size={15} />
            刷新
          </button>
        </div>
      </header>

      {state === "loading" ? (
        <div className="inline-flex items-center gap-3 rounded border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
          <Loader2 className="animate-spin" size={16} />
          正在加载模型配置...
        </div>
      ) : null}

      {error ? (
        <div className="rounded border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {message}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-4">
          <SectionCard title="新增服务商">
            <div className="mt-4 grid gap-3">
              <Field label="服务商 Key">
                <input
                  className={inputClass}
                  onChange={(event) => setProviderForm((current) => ({ ...current, key: event.target.value }))}
                  placeholder="openai-compatible"
                  value={providerForm.key}
                />
              </Field>
              <Field label="显示名称">
                <input
                  className={inputClass}
                  onChange={(event) => setProviderForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="OpenAI 兼容服务商"
                  value={providerForm.name}
                />
              </Field>
              <Field label="适配器类型">
                <input
                  className={inputClass}
                  onChange={(event) => setProviderForm((current) => ({ ...current, kind: event.target.value }))}
                  placeholder="openai-compatible"
                  value={providerForm.kind}
                />
              </Field>
              <Field label="默认 Base URL">
                <input
                  className={inputClass}
                  onChange={(event) =>
                    setProviderForm((current) => ({ ...current, defaultBaseUrl: event.target.value }))
                  }
                  placeholder="https://api.openai.com/v1"
                  value={providerForm.defaultBaseUrl}
                />
              </Field>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded bg-sky-400 px-4 text-sm font-semibold text-slate-950 hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canManage || saving}
                onClick={() => void handleCreateProvider()}
                type="button"
              >
                <Plus size={15} />
                创建服务商
              </button>
            </div>
          </SectionCard>

          <SectionCard title="新增或更新凭证">
            <div className="mt-4 grid gap-3">
              <Field label="所属服务商">
                <select
                  className={selectClass}
                  onChange={(event) =>
                    setCredentialForm((current) => ({ ...current, providerId: event.target.value }))
                  }
                  value={credentialForm.providerId}
                >
                  <option value="">请选择服务商</option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name} ({provider.key})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="凭证名称">
                <input
                  className={inputClass}
                  onChange={(event) => setCredentialForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="默认 API Key"
                  value={credentialForm.name}
                />
              </Field>
              <Field label="API Key">
                <input
                  className={inputClass}
                  onChange={(event) => setCredentialForm((current) => ({ ...current, secret: event.target.value }))}
                  placeholder="只会加密保存，不会明文展示"
                  type="password"
                  value={credentialForm.secret}
                />
              </Field>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded bg-sky-400 px-4 text-sm font-semibold text-slate-950 hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canManageCredentials || saving}
                onClick={() => void handleCreateCredential()}
                type="button"
              >
                <KeyRound size={15} />
                保存新凭证
              </button>
              <div className="border-t border-white/10 pt-3">
                <Field label="替换已有凭证 Key">
                  <select
                    className={selectClass}
                    onChange={(event) => setRotateCredentialId(event.target.value)}
                    value={rotateCredentialId}
                  >
                    <option value="">请选择凭证</option>
                    {credentials.map((credential) => (
                      <option key={credential.id} value={credential.id}>
                        {credential.name} {credential.maskedSecret}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <input
                    className={inputClass}
                    onChange={(event) => setRotateSecret(event.target.value)}
                    placeholder="新的 API Key"
                    type="password"
                    value={rotateSecret}
                  />
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canManageCredentials || rotating}
                    onClick={() => void handleRotateCredential()}
                    type="button"
                  >
                    {rotating ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
                    更新
                  </button>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="一键新增模型、线路和价格">
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field label="模型类型">
                <select
                  className={selectClass}
                  onChange={(event) =>
                    setBundleForm((current) => ({ ...current, modality: event.target.value as AiModality }))
                  }
                  value={bundleForm.modality}
                >
                  {MODALITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} ({option.unit})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="服务商">
                <select
                  className={selectClass}
                  onChange={(event) =>
                    setBundleForm((current) => ({
                      ...current,
                      credentialId: "",
                      providerId: event.target.value,
                    }))
                  }
                  value={bundleForm.providerId}
                >
                  <option value="">请选择服务商</option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name} ({provider.key})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="模型 ID">
                <input
                  className={inputClass}
                  onChange={(event) => setBundleForm((current) => ({ ...current, modelKey: event.target.value }))}
                  placeholder="gpt-4o-mini / flux-pro / veo-3"
                  value={bundleForm.modelKey}
                />
              </Field>
              <Field label="显示名称">
                <input
                  className={inputClass}
                  onChange={(event) => setBundleForm((current) => ({ ...current, displayName: event.target.value }))}
                  placeholder="给后台和画布用户看的名称"
                  value={bundleForm.displayName}
                />
              </Field>
              <Field label="线路 Key">
                <input
                  className={inputClass}
                  onChange={(event) => setBundleForm((current) => ({ ...current, routeKey: event.target.value }))}
                  placeholder="image.openai.gpt-image-2"
                  value={bundleForm.routeKey}
                />
              </Field>
              <Field label="绑定凭证">
                <select
                  className={selectClass}
                  onChange={(event) => setBundleForm((current) => ({ ...current, credentialId: event.target.value }))}
                  value={bundleForm.credentialId}
                >
                  <option value="">不绑定</option>
                  {providerCredentials.map((credential) => (
                    <option key={credential.id} value={credential.id}>
                      {credential.name} {credential.maskedSecret}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Base URL 覆盖">
                <input
                  className={inputClass}
                  onChange={(event) =>
                    setBundleForm((current) => ({ ...current, baseUrlOverride: event.target.value }))
                  }
                  placeholder="留空则使用服务商默认地址"
                  value={bundleForm.baseUrlOverride}
                />
              </Field>
              <Field label="超时时间（毫秒）">
                <input
                  className={inputClass}
                  onChange={(event) => setBundleForm((current) => ({ ...current, timeoutMs: event.target.value }))}
                  type="number"
                  value={bundleForm.timeoutMs}
                />
              </Field>
              <Field label="最低扣费点数">
                <input
                  className={inputClass}
                  min={1}
                  onChange={(event) =>
                    setBundleForm((current) => ({ ...current, minChargeCredits: event.target.value }))
                  }
                  type="number"
                  value={bundleForm.minChargeCredits}
                />
              </Field>
              <Field label="单位扣费点数">
                <input
                  className={inputClass}
                  min={1}
                  onChange={(event) =>
                    setBundleForm((current) => ({ ...current, unitCredits: event.target.value }))
                  }
                  type="number"
                  value={bundleForm.unitCredits}
                />
              </Field>
            </div>
            <button
              className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded bg-sky-400 px-4 text-sm font-semibold text-slate-950 hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canManage || saving}
              onClick={() => void handleCreateModelRoutePricing()}
              type="button"
            >
              {saving ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}
              创建模型线路
            </button>
          </SectionCard>

          <SectionCard title="已有模型和线路">
            <div className="mt-4 flex flex-wrap gap-2">
              {MODALITY_OPTIONS.map((option) => (
                <button
                  className={`h-9 rounded px-3 text-sm ${
                    activeModality === option.value
                      ? "bg-sky-400 text-slate-950"
                      : "border border-white/10 bg-white/10 text-slate-300 hover:bg-white/15"
                  }`}
                  key={option.value}
                  onClick={() => setActiveModality(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.2fr)]">
              <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {visibleRoutes.length === 0 ? (
                  <div className="rounded border border-white/10 bg-black/20 p-4 text-sm text-slate-400">
                    暂无 {modalityLabel(activeModality)} 线路。
                  </div>
                ) : (
                  visibleRoutes.map((route) => (
                    <button
                      className={`w-full rounded border p-3 text-left text-sm ${
                        selectedRouteId === route.id
                          ? "border-sky-300/50 bg-sky-400/10"
                          : "border-white/10 bg-black/20 hover:bg-white/[0.06]"
                      }`}
                      key={route.id}
                      onClick={() => setSelectedRouteId(route.id)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-white">{route.routeKey}</div>
                          <div className="mt-1 truncate text-xs text-slate-500">
                            {modelName(models, route.modelId)}
                          </div>
                        </div>
                        <span className="shrink-0 rounded bg-white/10 px-2 py-1 text-xs text-slate-300">
                          {route.tenantId ? "工作区" : "系统"}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>

              <div className="rounded border border-white/10 bg-black/20 p-4">
                {selectedRoute ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs tracking-[0.18em] text-slate-500">线路详情</div>
                        <h3 className="mt-1 text-base font-semibold text-white">{selectedRoute.routeKey}</h3>
                      </div>
                      <span className="rounded bg-white/10 px-2 py-1 text-xs text-slate-300">
                        {selectedRouteIsTenantOwned ? "可编辑" : "系统只读"}
                      </span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="模型">
                        <select
                          className={selectClass}
                          disabled={!selectedRouteIsTenantOwned}
                          onChange={(event) => setRouteModelId(event.target.value)}
                          value={routeModelId}
                        >
                          <option value="">请选择模型</option>
                          {visibleModels.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.displayName} ({model.modelKey})
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="凭证">
                        <select
                          className={selectClass}
                          disabled={!selectedRouteIsTenantOwned}
                          onChange={(event) => setRouteCredentialId(event.target.value)}
                          value={routeCredentialId}
                        >
                          <option value="">不绑定</option>
                          {credentials
                            .filter((credential) => credential.providerId === selectedRoute.providerId)
                            .map((credential) => (
                              <option key={credential.id} value={credential.id}>
                                {credential.name} {credential.maskedSecret}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <Field label="状态">
                        <select
                          className={selectClass}
                          disabled={!selectedRouteIsTenantOwned}
                          onChange={(event) => setRouteStatus(event.target.value as "active" | "inactive")}
                          value={routeStatus}
                        >
                          <option value="active">启用</option>
                          <option value="inactive">停用</option>
                        </select>
                      </Field>
                      <Field label="超时时间（毫秒）">
                        <input
                          className={inputClass}
                          disabled={!selectedRouteIsTenantOwned}
                          onChange={(event) => setRouteTimeoutMs(event.target.value)}
                          type="number"
                          value={routeTimeoutMs}
                        />
                      </Field>
                      <Field label="Base URL 覆盖">
                        <input
                          className={inputClass}
                          disabled={!selectedRouteIsTenantOwned}
                          onChange={(event) => setRouteBaseUrlOverride(event.target.value)}
                          placeholder="留空则使用服务商默认地址"
                          value={routeBaseUrlOverride}
                        />
                      </Field>
                      <Field label={`最低扣费点数（${pricingUnitFor(selectedRoute.modality)}）`}>
                        <input
                          className={inputClass}
                          disabled={!selectedRouteIsTenantOwned}
                          min={1}
                          onChange={(event) => setRouteMinChargeCredits(event.target.value)}
                          type="number"
                          value={routeMinChargeCredits}
                        />
                      </Field>
                      <Field label="单位扣费点数">
                        <input
                          className={inputClass}
                          disabled={!selectedRouteIsTenantOwned}
                          min={1}
                          onChange={(event) => setRouteUnitCredits(event.target.value)}
                          type="number"
                          value={routeUnitCredits}
                        />
                      </Field>
                    </div>
                    <div className="grid gap-2 rounded border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400 md:grid-cols-2">
                      <div>服务商：{providerName(providers, selectedRoute.providerId)}</div>
                      <div>类型：{modalityLabel(selectedRoute.modality)}</div>
                      <div>凭证：{credentialName(credentials, selectedRoute.credentialId)}</div>
                      <div>状态：{statusLabel(selectedRoute.status)}</div>
                      <div>当前最低扣费：{selectedPricing?.minChargeCredits ?? "-"}</div>
                      <div>当前单位扣费：{selectedPricing?.unitCredits ?? "-"}</div>
                    </div>
                    <button
                      className="inline-flex h-10 items-center justify-center gap-2 rounded bg-sky-400 px-4 text-sm font-semibold text-slate-950 hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!canManage || !selectedRouteIsTenantOwned || saving}
                      onClick={() => void handleSaveRoute()}
                      type="button"
                    >
                      {saving ? <Loader2 className="animate-spin" size={15} /> : <Settings2 size={15} />}
                      保存线路
                    </button>
                  </div>
                ) : (
                  <div className="p-6 text-sm text-slate-400">请选择一条线路。</div>
                )}
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </section>
  );
}
