import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  FlaskConical,
  KeyRound,
  Loader2,
  PackagePlus,
  Power,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from "lucide-react";

import {
  ACCOUNT_PROVIDER_SETTINGS_ROUTE,
} from "../../app/routes";
import { useAuth } from "../../auth/useAuth";
import {
  disableAiPluginInstall,
  installAiPlugin,
  listAiPlugins,
  publishAiPluginInstall,
  type AiPluginModality,
  type AiPluginSummary,
} from "../../services/v2AiPluginAdminApi";
import {
  listAiModelCatalog,
  listAiModelRoutes,
  testAiRoute,
  type AiModelCatalogItem,
  type AiModelCatalogRoute,
  type AiRouteTestResult,
} from "../../services/v2AiModelCatalogApi";

type LoadState = "idle" | "loading" | "ready" | "error";

const MODALITIES: Array<{ label: string; value: AiPluginModality }> = [
  { label: "生图", value: "image" },
  { label: "文本", value: "text" },
  { label: "视频", value: "video" },
];

const inputClass =
  "h-10 w-full rounded border border-white/10 bg-black/25 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300/50";

function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function statusLabel(status?: string | null) {
  if (status === "published") return "已发布";
  if (status === "draft") return "草稿";
  if (status === "disabled") return "已停用";
  if (status === "active") return "启用";
  if (status === "inactive") return "停用";
  return status || "-";
}

function modalityLabel(value?: string | null) {
  return MODALITIES.find((item) => item.value === value)?.label ?? value ?? "-";
}

function formatCredits(value: number | null) {
  return value === null ? "-" : `${value} 点`;
}

function JsonPreview({ value }: { value: unknown }) {
  return (
    <pre className="max-h-56 overflow-auto rounded border border-white/10 bg-black/30 p-3 text-xs leading-5 text-slate-300">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.04] p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

export function AiSettingsPage() {
  const { permissions } = useAuth();
  const canRead =
    permissions.includes("provider:read") ||
    permissions.includes("provider:manage") ||
    permissions.includes("credential:manage");
  const canManage = permissions.includes("provider:manage");

  const [state, setState] = useState<LoadState>("idle");
  const [activeModality, setActiveModality] = useState<AiPluginModality>("image");
  const [plugins, setPlugins] = useState<AiPluginSummary[]>([]);
  const [models, setModels] = useState<AiModelCatalogItem[]>([]);
  const [selectedPluginKey, setSelectedPluginKey] = useState("");
  const [selectedModelKey, setSelectedModelKey] = useState("");
  const [routes, setRoutes] = useState<AiModelCatalogRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [routeTest, setRouteTest] = useState<AiRouteTestResult | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [credentialName, setCredentialName] = useState("");
  const [baseUrlOverride, setBaseUrlOverride] = useState("");
  const [installing, setInstalling] = useState(false);
  const [testingRouteId, setTestingRouteId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedPlugin = useMemo(
    () => plugins.find((plugin) => plugin.packageKey === selectedPluginKey) ?? null,
    [plugins, selectedPluginKey],
  );
  const installedPlugins = useMemo(
    () => plugins.filter((plugin) => plugin.install),
    [plugins],
  );
  const publishedModels = useMemo(
    () => models.filter((model) => model.status === "active"),
    [models],
  );
  const selectedModel = useMemo(
    () => models.find((model) => model.modelKey === selectedModelKey) ?? null,
    [models, selectedModelKey],
  );

  const refresh = useCallback(async () => {
    if (!canRead) {
      setState("error");
      setError("当前账号没有访问模型中心的权限。");
      return;
    }

    setState("loading");
    setError("");
    try {
      const [nextPlugins, nextModels] = await Promise.all([
        listAiPlugins(activeModality),
        listAiModelCatalog(activeModality),
      ]);
      setPlugins(nextPlugins);
      setModels(nextModels);
      setSelectedPluginKey((current) => current || nextPlugins[0]?.packageKey || "");
      setSelectedModelKey((current) => {
        if (current && nextModels.some((model) => model.modelKey === current)) return current;
        return nextModels[0]?.modelKey || "";
      });
      setState("ready");
    } catch (cause) {
      setState("error");
      setError(cause instanceof Error ? cause.message : "模型中心数据加载失败。");
    }
  }, [activeModality, canRead]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedModelKey) {
      setRoutes([]);
      setSelectedRouteId("");
      return;
    }
    let cancelled = false;
    void listAiModelRoutes(selectedModelKey)
      .then((nextRoutes) => {
        if (cancelled) return;
        setRoutes(nextRoutes);
        setSelectedRouteId((current) => {
          if (current && nextRoutes.some((route) => route.routeId === current)) return current;
          return nextRoutes[0]?.routeId || "";
        });
      })
      .catch((cause) => {
        if (!cancelled) {
          setRoutes([]);
          setSelectedRouteId("");
          setError(cause instanceof Error ? cause.message : "模型线路加载失败。");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedModelKey]);

  useEffect(() => {
    if (!selectedPlugin) return;
    setCredentialName((current) => current || `${selectedPlugin.displayName} API Key`);
  }, [selectedPlugin]);

  async function handleInstallPlugin(publishImmediately: boolean) {
    if (!selectedPlugin) return;
    if (!apiKey.trim() && !selectedPlugin.install?.credentialId) {
      setError("请输入 API Key。已有凭证的插件可留空复用原凭证。");
      return;
    }

    setInstalling(true);
    setError("");
    setMessage("");
    try {
      const result = await installAiPlugin(selectedPlugin.packageKey, {
        baseUrlOverride: baseUrlOverride.trim() || null,
        credential: apiKey.trim()
          ? {
              name: credentialName.trim() || `${selectedPlugin.displayName} API Key`,
              secret: apiKey.trim(),
            }
          : undefined,
        publishImmediately,
      });
      setApiKey("");
      setMessage(`${selectedPlugin.displayName} 已${publishImmediately ? "安装并发布" : "安装为草稿"}。`);
      setSelectedModelKey(result.catalogModelKeys[0] || "");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "插件安装失败。");
    } finally {
      setInstalling(false);
    }
  }

  async function handlePublish() {
    if (!selectedPlugin?.install) return;
    setInstalling(true);
    setError("");
    setMessage("");
    try {
      await publishAiPluginInstall(selectedPlugin.install.id);
      setMessage(`${selectedPlugin.displayName} 已发布到画布。`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "发布失败。");
    } finally {
      setInstalling(false);
    }
  }

  async function handleDisable() {
    if (!selectedPlugin?.install) return;
    setInstalling(true);
    setError("");
    setMessage("");
    try {
      await disableAiPluginInstall(selectedPlugin.install.id);
      setMessage(`${selectedPlugin.displayName} 已停用。`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "停用失败。");
    } finally {
      setInstalling(false);
    }
  }

  async function handleTestRoute(route: AiModelCatalogRoute) {
    setTestingRouteId(route.routeId);
    setRouteTest(null);
    setError("");
    try {
      const result = await testAiRoute(route.routeId);
      setRouteTest(result);
      setMessage(`${route.routeKey} 测试${result.status === "ok" ? "成功" : "失败"}。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "线路测试失败。");
    } finally {
      setTestingRouteId("");
    }
  }

  if (!canRead) {
    return (
      <section className="rounded border border-amber-400/20 bg-amber-400/10 p-5 text-sm text-amber-100">
        当前账号没有模型中心访问权限。
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-sky-300">AI MODEL CENTER</div>
          <h1 className="mt-2 text-2xl font-semibold text-white">模型中心</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            通过插件安装模型，自动创建服务商、模型、线路和价格。发布后，画布只会看到模型及其对应线路。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex h-10 items-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15"
            onClick={() => navigate(ACCOUNT_PROVIDER_SETTINGS_ROUTE)}
            type="button"
          >
            <Settings2 size={15} />
            高级配置
          </button>
          <button
            className="inline-flex h-10 items-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15"
            onClick={() => void refresh()}
            type="button"
          >
            {state === "loading" ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
            刷新
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="已安装插件" value={installedPlugins.length} />
        <MetricCard label="已发布模型" value={publishedModels.length} />
        <MetricCard label="当前模型线路" value={routes.length} />
      </div>

      <div className="flex flex-wrap gap-2">
        {MODALITIES.map((item) => (
          <button
            className={`inline-flex h-9 items-center rounded px-3 text-sm ${
              activeModality === item.value
                ? "bg-sky-400 text-slate-950"
                : "border border-white/10 bg-white/10 text-slate-300 hover:bg-white/15"
            }`}
            key={item.value}
            onClick={() => {
              setActiveModality(item.value);
              setSelectedPluginKey("");
              setSelectedModelKey("");
            }}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.95fr)_minmax(0,1.05fr)]">
        <section className="rounded border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">插件库</h2>
              <p className="mt-1 text-sm text-slate-400">选择插件并填写密钥。</p>
            </div>
            <PackagePlus className="text-sky-300" size={20} />
          </div>

          <div className="mt-4 space-y-3">
            {plugins.map((plugin) => {
              const active = plugin.packageKey === selectedPluginKey;
              return (
                <button
                  className={`w-full rounded border p-4 text-left transition ${
                    active
                      ? "border-sky-300/40 bg-sky-400/10"
                      : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/[0.06]"
                  }`}
                  key={plugin.packageKey}
                  onClick={() => setSelectedPluginKey(plugin.packageKey)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-white">{plugin.displayName}</div>
                      <div className="mt-1 text-xs text-slate-500">{plugin.packageKey}</div>
                    </div>
                    <span className="rounded bg-white/10 px-2 py-1 text-xs text-slate-300">
                      {plugin.install ? statusLabel(plugin.install.status) : "未安装"}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{plugin.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {plugin.models.map((model) => (
                      <span className="rounded bg-black/30 px-2 py-1 text-xs text-slate-300" key={model.modelKey}>
                        {model.displayName}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
            {plugins.length === 0 && state !== "loading" ? (
              <div className="rounded border border-dashed border-white/10 p-5 text-sm text-slate-400">
                当前类型暂无可安装插件。
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">安装向导</h2>
              <p className="mt-1 text-sm text-slate-400">密钥只会加密保存，前端不会再次显示明文。</p>
            </div>
            <KeyRound className="text-emerald-300" size={20} />
          </div>

          {selectedPlugin ? (
            <div className="mt-4 space-y-4">
              <div className="rounded border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-white">{selectedPlugin.displayName}</div>
                    <div className="mt-1 text-sm text-slate-400">
                      {selectedPlugin.provider.name} / {selectedPlugin.provider.kind}
                    </div>
                  </div>
                  <span className="rounded bg-white/10 px-2 py-1 text-xs text-slate-300">
                    {selectedPlugin.install ? statusLabel(selectedPlugin.install.status) : "未安装"}
                  </span>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-slate-400">凭证名称</span>
                  <input
                    className={inputClass}
                    onChange={(event) => setCredentialName(event.target.value)}
                    value={credentialName}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-slate-400">Base URL 覆盖</span>
                  <input
                    className={inputClass}
                    onChange={(event) => setBaseUrlOverride(event.target.value)}
                    placeholder="留空使用插件默认地址"
                    value={baseUrlOverride}
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="mb-1.5 block text-xs font-medium text-slate-400">API Key</span>
                  <input
                    className={inputClass}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={selectedPlugin.install?.credentialId ? "留空复用已有凭证" : "请输入 API Key"}
                    type="password"
                    value={apiKey}
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className="inline-flex h-10 items-center gap-2 rounded bg-sky-400 px-4 text-sm font-semibold text-slate-950 hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canManage || installing}
                  onClick={() => void handleInstallPlugin(true)}
                  type="button"
                >
                  {installing ? <Loader2 className="animate-spin" size={15} /> : <ShieldCheck size={15} />}
                  安装并发布
                </button>
                <button
                  className="inline-flex h-10 items-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canManage || installing}
                  onClick={() => void handleInstallPlugin(false)}
                  type="button"
                >
                  安装为草稿
                </button>
                {selectedPlugin.install ? (
                  <>
                    <button
                      className="inline-flex h-10 items-center gap-2 rounded border border-emerald-300/25 bg-emerald-500/10 px-4 text-sm text-emerald-100 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!canManage || installing}
                      onClick={() => void handlePublish()}
                      type="button"
                    >
                      <CheckCircle2 size={15} />
                      发布
                    </button>
                    <button
                      className="inline-flex h-10 items-center gap-2 rounded border border-red-300/25 bg-red-500/10 px-4 text-sm text-red-100 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!canManage || installing}
                      onClick={() => void handleDisable()}
                      type="button"
                    >
                      <Power size={15} />
                      停用
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded border border-dashed border-white/10 p-6 text-sm text-slate-400">
              请选择一个插件。
            </div>
          )}
        </section>
      </div>

      <section className="rounded border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">已发布模型与线路</h2>
            <p className="mt-1 text-sm text-slate-400">选择模型后，只显示该模型可用线路。</p>
          </div>
          <Activity className="text-sky-300" size={20} />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)]">
          <div className="space-y-2">
            {models.map((model) => (
              <button
                className={`w-full rounded border p-3 text-left ${
                  selectedModelKey === model.modelKey
                    ? "border-sky-300/40 bg-sky-400/10"
                    : "border-white/10 bg-black/20 hover:bg-white/[0.06]"
                }`}
                key={model.id}
                onClick={() => setSelectedModelKey(model.modelKey)}
                type="button"
              >
                <div className="font-medium text-white">{model.displayName}</div>
                <div className="mt-1 text-xs text-slate-500">{model.modelKey}</div>
                <div className="mt-2 text-xs text-slate-400">
                  {modalityLabel(model.modality)} / {model.modelFamily}
                </div>
              </button>
            ))}
            {models.length === 0 ? (
              <div className="rounded border border-dashed border-white/10 p-5 text-sm text-slate-400">
                暂无已发布模型。先在上方安装并发布插件。
              </div>
            ) : null}
          </div>

          <div className="rounded border border-white/10 bg-black/20 p-4">
            {selectedModel ? (
              <div className="space-y-4">
                <div>
                  <div className="text-xs tracking-[0.18em] text-slate-500">当前模型</div>
                  <h3 className="mt-1 text-base font-semibold text-white">{selectedModel.displayName}</h3>
                </div>
                <div className="grid gap-3">
                  {routes.map((route) => (
                    <div
                      className={`rounded border p-4 ${
                        selectedRouteId === route.routeId
                          ? "border-sky-300/40 bg-sky-400/10"
                          : "border-white/10 bg-white/[0.03]"
                      }`}
                      key={route.routeId}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-white">{route.routeLabel || route.routeKey}</div>
                          <div className="mt-1 text-xs text-slate-500">{route.routeKey}</div>
                          <div className="mt-2 text-sm text-slate-400">
                            {route.providerName} / 预估 {formatCredits(route.estimatedCredits)}
                          </div>
                        </div>
                        <button
                          className="inline-flex h-9 items-center gap-2 rounded border border-emerald-300/25 bg-emerald-500/10 px-3 text-sm text-emerald-100 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={!canManage || testingRouteId === route.routeId}
                          onClick={() => {
                            setSelectedRouteId(route.routeId);
                            void handleTestRoute(route);
                          }}
                          type="button"
                        >
                          {testingRouteId === route.routeId ? (
                            <Loader2 className="animate-spin" size={14} />
                          ) : (
                            <FlaskConical size={14} />
                          )}
                          测试线路
                        </button>
                      </div>
                    </div>
                  ))}
                  {routes.length === 0 ? (
                    <div className="rounded border border-dashed border-white/10 p-5 text-sm text-slate-400">
                      这个模型当前没有可用线路。
                    </div>
                  ) : null}
                </div>
                {routeTest ? (
                  <div className="rounded border border-white/10 bg-black/30 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="font-medium text-white">
                        最近测试：{routeTest.status === "ok" ? "成功" : "失败"}
                      </div>
                      <div className="text-xs text-slate-400">{routeTest.latencyMs} ms</div>
                    </div>
                    <JsonPreview value={routeTest.status === "ok" ? routeTest.responseSummary : routeTest.error} />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="p-6 text-sm text-slate-400">请选择一个模型。</div>
            )}
          </div>
        </div>
      </section>
    </section>
  );
}
