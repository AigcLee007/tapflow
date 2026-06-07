import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, Loader2, RefreshCw, Rocket, ShieldCheck } from "lucide-react";

import { ACCOUNT_PROVIDER_SETTINGS_ROUTE, ACCOUNT_ROUTE } from "../app/routes";
import { useAuth } from "../auth/useAuth";
import {
  disableAiPluginInstall,
  installAiPlugin,
  listAiPlugins,
  publishAiPluginInstall,
  type AiPluginModality,
  type AiPluginSummary,
} from "../services/v2AiPluginAdminApi";

type LoadState = "idle" | "loading" | "error" | "ready";

type InstallFormState = {
  baseUrlOverride: string;
  credentialName: string;
  credentialSecret: string;
  publishImmediately: boolean;
};

const MODALITIES: Array<{ label: string; value: AiPluginModality }> = [
  { label: "生图", value: "image" },
  { label: "文本", value: "text" },
  { label: "视频", value: "video" },
];

const inputClass =
  "h-10 w-full rounded border border-white/10 bg-black/25 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300/50";
const checkboxClass = "h-4 w-4 rounded border-white/20 bg-black/30 text-sky-400 focus:ring-sky-400/40";

function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function installStatusLabel(status?: string | null) {
  if (status === "published") return "已初始化";
  if (status === "draft") return "已安装未发布";
  if (status === "disabled") return "已停用";
  return status || "未安装";
}

function buildInstallForm(plugin: AiPluginSummary | null): InstallFormState {
  const providerName = plugin?.provider.name || "模板";
  return {
    baseUrlOverride: "",
    credentialName: `${providerName} Key`,
    credentialSecret: "",
    publishImmediately: true,
  };
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.04] p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

export function TemplateLibraryPage() {
  const { permissions } = useAuth();
  const canRead =
    permissions.includes("provider:read") ||
    permissions.includes("provider:manage") ||
    permissions.includes("credential:manage");
  const canManage = permissions.includes("provider:manage");

  const [state, setState] = useState<LoadState>("idle");
  const [activeModality, setActiveModality] = useState<AiPluginModality>("image");
  const [plugins, setPlugins] = useState<AiPluginSummary[]>([]);
  const [selectedPackageKey, setSelectedPackageKey] = useState("");
  const [installForm, setInstallForm] = useState<InstallFormState>(buildInstallForm(null));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyPackageKey, setBusyPackageKey] = useState("");

  const selectedPlugin = useMemo(
    () => plugins.find((plugin) => plugin.packageKey === selectedPackageKey) ?? null,
    [plugins, selectedPackageKey],
  );

  const refresh = useCallback(async () => {
    if (!canRead) {
      setState("error");
      setError("当前账号没有访问模板库的权限。");
      return;
    }

    setState("loading");
    setError("");
    try {
      const nextPlugins = await listAiPlugins(activeModality);
      setPlugins(nextPlugins);
      setSelectedPackageKey((current) => {
        if (current && nextPlugins.some((plugin) => plugin.packageKey === current)) return current;
        return nextPlugins[0]?.packageKey || "";
      });
      setState("ready");
    } catch (cause) {
      setState("error");
      setError(cause instanceof Error ? cause.message : "模板库加载失败。");
    }
  }, [activeModality, canRead]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setInstallForm(buildInstallForm(selectedPlugin));
  }, [selectedPlugin]);

  async function handleInstall() {
    if (!selectedPlugin) return;
    setBusyPackageKey(selectedPlugin.packageKey);
    setError("");
    setMessage("");
    try {
      const result = await installAiPlugin(selectedPlugin.packageKey, {
        baseUrlOverride: installForm.baseUrlOverride.trim() || undefined,
        credential: installForm.credentialSecret.trim()
          ? {
              name: installForm.credentialName.trim() || undefined,
              secret: installForm.credentialSecret.trim(),
            }
          : undefined,
        publishImmediately: installForm.publishImmediately,
      });
      setMessage(
        `模板已初始化：${selectedPlugin.displayName}。生成模型 ${result.catalogModelKeys.join(", ") || "-"}；线路 ${result.routeKeys.join(", ") || "-"}`,
      );
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "模板初始化失败。");
    } finally {
      setBusyPackageKey("");
    }
  }

  async function handlePublish() {
    if (!selectedPlugin?.install) return;
    setBusyPackageKey(selectedPlugin.packageKey);
    setError("");
    setMessage("");
    try {
      await publishAiPluginInstall(selectedPlugin.install.id);
      setMessage(`模板实例已发布：${selectedPlugin.displayName}`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "发布模板实例失败。");
    } finally {
      setBusyPackageKey("");
    }
  }

  async function handleDisable() {
    if (!selectedPlugin?.install) return;
    setBusyPackageKey(selectedPlugin.packageKey);
    setError("");
    setMessage("");
    try {
      await disableAiPluginInstall(selectedPlugin.install.id);
      setMessage(`模板实例已停用：${selectedPlugin.displayName}`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "停用模板实例失败。");
    } finally {
      setBusyPackageKey("");
    }
  }

  if (!canRead) {
    return (
      <section className="rounded border border-amber-400/20 bg-amber-400/10 p-5 text-sm text-amber-100">
        当前账号没有访问模板库的权限。
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-sky-300">模板库</div>
          <h1 className="mt-2 text-2xl font-semibold text-white">Template Library</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            这里不再是日常操作入口，只负责用模板快速初始化一套可用的服务商、模型、线路和价格基础配置。
            初始化完成后，请回到模型中心和连接页继续日常管理。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex h-10 items-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15"
            onClick={() => navigate(ACCOUNT_ROUTE)}
            type="button"
          >
            <ArrowLeft size={15} />
            返回账户中心
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
        <MetricCard label="当前模板数" value={plugins.length} />
        <MetricCard label="已初始化模板" value={plugins.filter((plugin) => plugin.install).length} />
        <MetricCard
          label="主操作入口"
          value="模型中心 / 连接页"
        />
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
            onClick={() => setActiveModality(item.value)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">可用模板</h2>
              <p className="mt-1 text-sm text-slate-400">只用于初始化，不建议当作日常管理页面。</p>
            </div>
            <Rocket className="text-sky-300" size={20} />
          </div>

          <div className="mt-4 space-y-2">
            {plugins.map((plugin) => {
              const isSelected = plugin.packageKey === selectedPackageKey;
              return (
                <button
                  className={`w-full rounded border p-4 text-left ${
                    isSelected
                      ? "border-sky-300/40 bg-sky-400/10"
                      : "border-white/10 bg-black/20 hover:bg-white/[0.06]"
                  }`}
                  key={plugin.packageKey}
                  onClick={() => setSelectedPackageKey(plugin.packageKey)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-white">{plugin.displayName}</div>
                      <div className="mt-1 text-xs text-slate-500">{plugin.packageKey}</div>
                    </div>
                    <span className="rounded bg-white/10 px-2 py-1 text-xs text-slate-300">
                      {installStatusLabel(plugin.install?.status)}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-slate-400">
                    <div>服务商：{plugin.provider.name}</div>
                    <div>模板版本：{plugin.version}</div>
                    <div>初始化模型：{plugin.models.map((model) => model.displayName).join("、") || "-"}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <div className="space-y-5">
          <section className="rounded border border-white/10 bg-white/[0.04] p-5">
            {selectedPlugin ? (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">模板详情</div>
                    <h2 className="mt-1 text-lg font-semibold text-white">{selectedPlugin.displayName}</h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                      {selectedPlugin.description}
                    </p>
                  </div>
                  <ShieldCheck className="text-sky-300" size={18} />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
                    <div className="text-xs text-slate-500">目标服务商</div>
                    <div className="mt-2 font-medium text-white">
                      {selectedPlugin.provider.name} ({selectedPlugin.provider.key})
                    </div>
                    <div className="mt-2 text-xs text-slate-400">
                      适配器类型：{selectedPlugin.provider.kind}
                    </div>
                  </div>
                  <div className="rounded border border-white/10 bg-black/20 p-4 text-sm text-slate-300">
                    <div className="text-xs text-slate-500">会初始化的模型</div>
                    <div className="mt-2 space-y-1">
                      {selectedPlugin.models.map((model) => (
                        <div key={model.modelKey}>
                          <span className="font-medium text-white">{model.displayName}</span>
                          <span className="ml-2 text-xs text-slate-500">{model.modelKey}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded border border-white/10 bg-black/20 p-4">
                  <div className="text-sm font-medium text-white">初始化参数</div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-slate-400">Base URL 覆盖</span>
                      <input
                        className={inputClass}
                        onChange={(event) =>
                          setInstallForm((current) => ({ ...current, baseUrlOverride: event.target.value }))
                        }
                        placeholder="可选，不填则使用模板默认地址"
                        value={installForm.baseUrlOverride}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-slate-400">凭证名称</span>
                      <input
                        className={inputClass}
                        onChange={(event) =>
                          setInstallForm((current) => ({ ...current, credentialName: event.target.value }))
                        }
                        placeholder="可选"
                        value={installForm.credentialName}
                      />
                    </label>
                    <label className="block md:col-span-2">
                      <span className="mb-1.5 block text-xs font-medium text-slate-400">初始化 API Key</span>
                      <input
                        className={inputClass}
                        onChange={(event) =>
                          setInstallForm((current) => ({ ...current, credentialSecret: event.target.value }))
                        }
                        placeholder="可选。如果留空，模板会创建结构，但你后面需要去连接页补密钥。"
                        type="password"
                        value={installForm.credentialSecret}
                      />
                    </label>
                    <label className="flex items-center gap-3 text-sm text-slate-300 md:col-span-2">
                      <input
                        checked={installForm.publishImmediately}
                        className={checkboxClass}
                        onChange={(event) =>
                          setInstallForm((current) => ({
                            ...current,
                            publishImmediately: event.target.checked,
                          }))
                        }
                        type="checkbox"
                      />
                      初始化后立即发布为可用配置
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      className="inline-flex h-10 items-center justify-center gap-2 rounded bg-sky-400 px-4 text-sm font-semibold text-slate-950 hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!canManage || busyPackageKey === selectedPlugin.packageKey}
                      onClick={() => void handleInstall()}
                      type="button"
                    >
                      {busyPackageKey === selectedPlugin.packageKey ? (
                        <Loader2 className="animate-spin" size={15} />
                      ) : (
                        <Download size={15} />
                      )}
                      初始化模板
                    </button>
                    <button
                      className="inline-flex h-10 items-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!canManage || !selectedPlugin.install || busyPackageKey === selectedPlugin.packageKey}
                      onClick={() => void handlePublish()}
                      type="button"
                    >
                      发布模板实例
                    </button>
                    <button
                      className="inline-flex h-10 items-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!canManage || !selectedPlugin.install || busyPackageKey === selectedPlugin.packageKey}
                      onClick={() => void handleDisable()}
                      type="button"
                    >
                      停用模板实例
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded border border-dashed border-white/10 p-6 text-sm text-slate-400">
                请选择一个模板。
              </div>
            )}
          </section>

          <section className="rounded border border-white/10 bg-white/[0.04] p-5">
            <div className="text-sm font-medium text-white">初始化之后怎么走</div>
            <div className="mt-3 space-y-2 text-sm leading-6 text-slate-400">
              <p>1. 模板库只负责创建第一套基础对象。</p>
              <p>2. 模型中心负责日常新增线路、设默认线路、测试和停用。</p>
              <p>3. 连接页负责 API Key、Base URL、Provider Connection 的维护和复用。</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="inline-flex h-9 items-center gap-2 rounded border border-white/10 bg-white/10 px-3 text-sm text-white hover:bg-white/15"
                onClick={() => navigate("/account/ai-settings")}
                type="button"
              >
                去模型中心
              </button>
              <button
                className="inline-flex h-9 items-center gap-2 rounded border border-white/10 bg-white/10 px-3 text-sm text-white hover:bg-white/15"
                onClick={() => navigate(ACCOUNT_PROVIDER_SETTINGS_ROUTE)}
                type="button"
              >
                去连接页
              </button>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
