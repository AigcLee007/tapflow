import React, { useEffect, useMemo, useState } from "react";

import {
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
  type ModelPricingRow,
  updateAdminRoute,
  upsertAdminPricing,
} from "../services/v2AiGatewayAdminApi";
import { ACCOUNT_ROUTE } from "../app/routes";
import { useAuth } from "../auth/useAuth";

type LoadState = "idle" | "loading" | "error" | "ready";

function asTimeoutMs(requestConfig: Record<string, unknown>): number {
  const value = requestConfig.timeoutMs;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return 120000;
}

function maskBaseUrl(value: string | null): string {
  if (!value) return "（未设置）";
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "（URL 无效）";
  }
}

function statusLabel(status: string | null | undefined) {
  if (status === "active") return "启用";
  if (status === "inactive") return "停用";
  if (status === "disabled") return "已禁用";
  return status || "-";
}

export function ProviderSettingsPage() {
  const { permissions } = useAuth();
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);

  const [providers, setProviders] = useState<AdminProvider[]>([]);
  const [models, setModels] = useState<AdminModel[]>([]);
  const [routes, setRoutes] = useState<AdminRoute[]>([]);
  const [credentials, setCredentials] = useState<AdminCredential[]>([]);
  const [pricing, setPricing] = useState<ModelPricingRow[]>([]);

  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [baseUrlOverride, setBaseUrlOverride] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [timeoutMs, setTimeoutMs] = useState(300000);
  const [status, setStatus] = useState("active");
  const [minChargeCredits, setMinChargeCredits] = useState(100);

  const [selectedCredentialId, setSelectedCredentialId] = useState("");
  const [newSecret, setNewSecret] = useState("");

  const canAccessProviderSettings =
    permissions.includes("provider:read") ||
    permissions.includes("provider:manage") ||
    permissions.includes("credential:manage");

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

  const selectedPricing = useMemo(() => {
    if (!selectedRoute || !selectedProvider || !selectedModel) return null;
    return pricing.find(
      (row) =>
        row.provider === selectedProvider.key &&
        row.model === selectedModel.modelKey &&
        row.route === selectedRoute.routeKey &&
        row.unit === "image_generation",
    ) ?? null;
  }, [pricing, selectedModel, selectedProvider, selectedRoute]);

  const refresh = async () => {
    if (!canAccessProviderSettings) {
      setState("error");
      setError("当前账号没有访问服务商设置的权限。");
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
        listAdminPricing("image_generation"),
      ]);
      setProviders(nextProviders);
      setModels(nextModels);
      setRoutes(nextRoutes);
      setCredentials(nextCredentials);
      setPricing(nextPricing);
      const openAiRoute = nextRoutes.find((item) => item.routeKey === "image.openai") ?? nextRoutes[0] ?? null;
      if (openAiRoute) {
        setSelectedRouteId(openAiRoute.id);
        setBaseUrlOverride(openAiRoute.baseUrlOverride ?? "");
        setSelectedModelId(openAiRoute.modelId ?? "");
        setTimeoutMs(asTimeoutMs(openAiRoute.requestConfig ?? {}));
        setStatus(openAiRoute.status || "active");
      } else {
        setSelectedRouteId("");
      }
      setState("ready");
    } catch (cause) {
      setState("error");
      setError(cause instanceof Error ? cause.message : "服务商设置加载失败。");
    }
  };

  useEffect(() => {
    void refresh();
  }, [canAccessProviderSettings]);

  useEffect(() => {
    if (!selectedRoute) return;
    setBaseUrlOverride(selectedRoute.baseUrlOverride ?? "");
    setSelectedModelId(selectedRoute.modelId ?? "");
    setTimeoutMs(asTimeoutMs(selectedRoute.requestConfig ?? {}));
    setStatus(selectedRoute.status || "active");
    const credential = credentials.find((item) => item.id === selectedRoute.credentialId);
    setSelectedCredentialId(credential?.id ?? "");
  }, [credentials, selectedRoute]);

  useEffect(() => {
    setMinChargeCredits(selectedPricing?.minChargeCredits ?? 100);
  }, [selectedPricing?.minChargeCredits]);

  const imageRoutes = routes.filter((route) => route.modality === "image");
  const imageModels = models.filter((model) => model.modality === "image");

  const onSaveRouteAndPricing = async () => {
    if (!selectedRoute) return;
    if (!selectedProvider) {
      setError("当前线路缺少对应的服务商。");
      return;
    }
    const model = models.find((item) => item.id === selectedModelId);
    if (!model) {
      setError("请选择有效的图片模型。");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await updateAdminRoute(selectedRoute.id, {
        baseUrlOverride: baseUrlOverride.trim() || null,
        modelId: model.id,
        requestConfig: {
          ...selectedRoute.requestConfig,
          timeoutMs: Math.max(1000, Math.floor(timeoutMs || 300000)),
        },
        status,
      });
      await upsertAdminPricing({
        active: true,
        minChargeCredits: Math.max(1, Math.floor(minChargeCredits || 1)),
        model: model.modelKey,
        provider: selectedProvider.key,
        route: selectedRoute.routeKey,
        unit: "image_generation",
      });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存线路设置失败。");
    } finally {
      setSaving(false);
    }
  };

  const onRotateCredential = async () => {
    if (!selectedCredentialId || !newSecret.trim()) {
      setError("请选择凭证并输入新的 API Key。");
      return;
    }
    setRotating(true);
    setError("");
    try {
      await rotateAdminCredential(selectedCredentialId, newSecret.trim());
      setNewSecret("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新凭证失败。");
    } finally {
      setRotating(false);
    }
  };

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-sky-300">服务商设置</div>
          <h1 className="mt-2 text-2xl font-semibold text-white">OpenAI 兼容线路管理</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            这是面向本地或开发环境的租户级管理面板。密钥仅支持写入保存，不会以明文展示。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded border border-white/15 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
            onClick={() => {
              window.location.assign(ACCOUNT_ROUTE);
            }}
            type="button"
          >
            返回账号中心
          </button>
          <button
            className="rounded border border-white/15 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
            onClick={() => void refresh()}
            type="button"
          >
            刷新
          </button>
        </div>
      </header>

      {state === "loading" && (
        <div className="rounded border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">正在加载设置...</div>
      )}
      {state === "error" && (
        <div className="rounded border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">{error || "设置加载失败。"}</div>
      )}

      {state === "ready" && (
        <>
          {error ? (
            <div className="rounded border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded border border-white/10 bg-white/[0.03] p-4">
              <h2 className="text-lg font-semibold text-white">线路设置</h2>
              <div className="mt-4 space-y-3">
                <label className="block text-xs tracking-[0.12em] text-slate-400">
                  线路
                  <select
                    className="mt-2 w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
                    onChange={(event) => setSelectedRouteId(event.target.value)}
                    value={selectedRouteId}
                  >
                    {imageRoutes.map((route) => (
                      <option key={route.id} value={route.id}>
                        {route.routeKey} ({statusLabel(route.status)})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs tracking-[0.12em] text-slate-400">
                  Base URL 覆盖地址
                  <input
                    className="mt-2 w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
                    onChange={(event) => setBaseUrlOverride(event.target.value)}
                    value={baseUrlOverride}
                  />
                </label>

                <label className="block text-xs tracking-[0.12em] text-slate-400">
                  图片模型
                  <select
                    className="mt-2 w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
                    onChange={(event) => setSelectedModelId(event.target.value)}
                    value={selectedModelId}
                  >
                    <option value="">请选择模型...</option>
                    {imageModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.displayName} ({model.modelKey})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs tracking-[0.12em] text-slate-400">
                  超时时间（毫秒）
                  <input
                    className="mt-2 w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
                    max={300000}
                    min={1000}
                    onChange={(event) => setTimeoutMs(Number(event.target.value) || 120000)}
                    step={1000}
                    type="number"
                    value={timeoutMs}
                  />
                </label>

                <label className="block text-xs tracking-[0.12em] text-slate-400">
                  状态
                  <select
                    className="mt-2 w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
                    onChange={(event) => setStatus(event.target.value)}
                    value={status}
                  >
                    <option value="active">启用</option>
                    <option value="inactive">停用</option>
                  </select>
                </label>

                <label className="block text-xs tracking-[0.12em] text-slate-400">
                  最低扣费点数（image_generation）
                  <input
                    className="mt-2 w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
                    min={1}
                    onChange={(event) => setMinChargeCredits(Number(event.target.value) || 1)}
                    step={1}
                    type="number"
                    value={minChargeCredits}
                  />
                </label>

                <button
                  className="rounded border border-sky-400/30 bg-sky-500/15 px-4 py-2 text-sm text-sky-100 hover:bg-sky-500/25 disabled:opacity-60"
                  disabled={saving || !selectedRoute}
                  onClick={() => void onSaveRouteAndPricing()}
                  type="button"
                >
                  {saving ? "保存中..." : "保存线路与定价"}
                </button>
              </div>
            </div>

            <div className="rounded border border-white/10 bg-white/[0.03] p-4">
              <h2 className="text-lg font-semibold text-white">凭证轮换</h2>
              <div className="mt-4 space-y-3">
                <label className="block text-xs tracking-[0.12em] text-slate-400">
                  凭证
                  <select
                    className="mt-2 w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
                    onChange={(event) => setSelectedCredentialId(event.target.value)}
                    value={selectedCredentialId}
                  >
                    <option value="">请选择凭证...</option>
                    {credentials.map((credential) => (
                      <option key={credential.id} value={credential.id}>
                        {credential.name} [{credential.maskedSecret}] ({statusLabel(credential.status)})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs tracking-[0.12em] text-slate-400">
                  新 API Key（仅写入）
                  <input
                    autoComplete="off"
                    className="mt-2 w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
                    onChange={(event) => setNewSecret(event.target.value)}
                    placeholder="粘贴新的密钥"
                    type="password"
                    value={newSecret}
                  />
                </label>

                <button
                  className="rounded border border-emerald-400/30 bg-emerald-500/15 px-4 py-2 text-sm text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-60"
                  disabled={rotating || !selectedCredentialId || !newSecret.trim()}
                  onClick={() => void onRotateCredential()}
                  type="button"
                >
                  {rotating ? "更新中..." : "轮换凭证"}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded border border-white/10 bg-white/[0.03] p-4">
            <h2 className="text-lg font-semibold text-white">当前线路快照</h2>
            <div className="mt-3 grid gap-2 text-sm text-slate-300 md:grid-cols-2">
              <div>线路键：{selectedRoute?.routeKey || "-"}</div>
              <div>类型：{selectedRoute?.modality || "-"}</div>
              <div>服务商：{selectedProvider ? `${selectedProvider.key} / ${selectedProvider.name}` : "-"}</div>
              <div>模型：{selectedModel ? `${selectedModel.modelKey} / ${selectedModel.displayName}` : "-"}</div>
              <div>状态：{statusLabel(selectedRoute?.status)}</div>
              <div>超时：{asTimeoutMs(selectedRoute?.requestConfig ?? {})} ms</div>
              <div>最低扣费：{selectedPricing?.minChargeCredits ?? "-"}</div>
              <div>Base URL：{maskBaseUrl(selectedRoute?.baseUrlOverride ?? selectedProvider?.defaultBaseUrl ?? null)}</div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
