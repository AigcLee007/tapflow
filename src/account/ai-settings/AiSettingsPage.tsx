import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRightLeft,
  Copy,
  FlaskConical,
  Loader2,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";

import { ACCOUNT_PROVIDER_SETTINGS_ROUTE } from "../../app/routes";
import { useAuth } from "../../auth/useAuth";
import {
  deleteAdminRoute,
  duplicateAdminRoute,
  listAdminCredentials,
  listAdminProviderConnections,
  listAdminRoutes,
  setDefaultAdminRoute,
  type AdminCredential,
  type AdminProviderConnection,
  type AdminRoute,
  updateAdminRoute,
} from "../../services/v2AiGatewayAdminApi";
import {
  listAiModelCatalog,
  listAiModelRoutes,
  testAiRoute,
  type AiModelCatalogItem,
  type AiModelCatalogRoute,
  type AiRouteTestResult,
} from "../../services/v2AiModelCatalogApi";

type LoadState = "idle" | "loading" | "ready" | "error";
type Modality = "image" | "text" | "video";

type RouteEditorState = {
  adminNotes: string;
  apiMode: string;
  connectionId: string;
  internalLabel: string;
  requestPath: string;
  routeLabel: string;
  status: "active" | "inactive";
  upstreamModel: string;
};

const MODALITIES: Array<{ label: string; value: Modality }> = [
  { label: "生图", value: "image" },
  { label: "文本", value: "text" },
  { label: "视频", value: "video" },
];

const buttonClass =
  "inline-flex h-9 items-center gap-2 rounded border border-white/10 bg-white/10 px-3 text-sm text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "h-10 w-full rounded border border-white/10 bg-black/25 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300/50";
const selectClass =
  "h-10 w-full rounded border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-sky-300/50";

function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function formatCredits(value: number | null) {
  return value === null ? "-" : `${value} 点`;
}

function statusLabel(status?: string | null) {
  if (status === "active") return "启用";
  if (status === "inactive") return "停用";
  if (status === "published") return "已发布";
  if (status === "draft") return "草稿";
  if (status === "disabled") return "已停用";
  return status || "-";
}

function JsonPreview({ value }: { value: unknown }) {
  return (
    <pre className="max-h-56 overflow-auto rounded border border-white/10 bg-black/30 p-3 text-xs leading-5 text-slate-300">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.04] p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

function findAdminRouteByKey(routes: AdminRoute[], routeKey: string | null | undefined) {
  if (!routeKey) return null;
  return routes.find((item) => item.routeKey === routeKey) ?? null;
}

function buildEditorState(route: AdminRoute | null): RouteEditorState {
  return {
    adminNotes: route?.adminNotes ?? "",
    apiMode: route?.apiMode ?? "",
    connectionId: route?.connectionId ?? "",
    internalLabel: route?.internalLabel ?? "",
    requestPath: route?.requestPath ?? "",
    routeLabel: route?.routeLabel ?? "",
    status: route?.status === "inactive" ? "inactive" : "active",
    upstreamModel: route?.upstreamModel ?? "",
  };
}

export function AiSettingsPage() {
  const { permissions } = useAuth();
  const canRead =
    permissions.includes("provider:read") ||
    permissions.includes("provider:manage") ||
    permissions.includes("credential:manage");
  const canManage = permissions.includes("provider:manage");

  const [state, setState] = useState<LoadState>("idle");
  const [activeModality, setActiveModality] = useState<Modality>("image");
  const [models, setModels] = useState<AiModelCatalogItem[]>([]);
  const [routes, setRoutes] = useState<AiModelCatalogRoute[]>([]);
  const [adminRoutes, setAdminRoutes] = useState<AdminRoute[]>([]);
  const [connections, setConnections] = useState<AdminProviderConnection[]>([]);
  const [credentials, setCredentials] = useState<AdminCredential[]>([]);
  const [selectedModelKey, setSelectedModelKey] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [routeTest, setRouteTest] = useState<AiRouteTestResult | null>(null);
  const [editor, setEditor] = useState<RouteEditorState>(buildEditorState(null));
  const [testingRouteId, setTestingRouteId] = useState("");
  const [savingRouteId, setSavingRouteId] = useState("");
  const [actionRouteId, setActionRouteId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedModel = useMemo(
    () => models.find((model) => model.modelKey === selectedModelKey) ?? null,
    [models, selectedModelKey],
  );
  const selectedCatalogRoute = useMemo(
    () => routes.find((route) => route.routeId === selectedRouteId) ?? null,
    [routes, selectedRouteId],
  );
  const selectedAdminRoute = useMemo(
    () =>
      adminRoutes.find((route) => route.id === selectedRouteId) ??
      findAdminRouteByKey(adminRoutes, selectedCatalogRoute?.routeKey),
    [adminRoutes, selectedCatalogRoute?.routeKey, selectedRouteId],
  );
  const selectedConnection = useMemo(
    () =>
      connections.find((connection) => connection.id === selectedAdminRoute?.connectionId) ?? null,
    [connections, selectedAdminRoute?.connectionId],
  );
  const selectedCredential = useMemo(
    () =>
      credentials.find((credential) => credential.id === selectedConnection?.credentialId) ?? null,
    [credentials, selectedConnection?.credentialId],
  );
  const editorConnections = useMemo(
    () =>
      connections.filter(
        (connection) =>
          connection.providerId === selectedAdminRoute?.providerId &&
          connection.status === "active",
      ),
    [connections, selectedAdminRoute?.providerId],
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
      const [nextModels, nextAdminRoutes, nextConnections, nextCredentials] = await Promise.all([
        listAiModelCatalog(activeModality),
        listAdminRoutes(),
        listAdminProviderConnections(),
        listAdminCredentials(),
      ]);
      setModels(nextModels);
      setAdminRoutes(nextAdminRoutes);
      setConnections(nextConnections);
      setCredentials(nextCredentials);
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
          const defaultRoute =
            nextRoutes.find((route) => route.routeKey === selectedModel?.defaultRouteKey) ?? nextRoutes[0];
          return defaultRoute?.routeId || "";
        });
      })
      .catch((cause) => {
        if (cancelled) return;
        setRoutes([]);
        setSelectedRouteId("");
        setError(cause instanceof Error ? cause.message : "模型线路加载失败。");
      });

    return () => {
      cancelled = true;
    };
  }, [selectedModel?.defaultRouteKey, selectedModelKey]);

  useEffect(() => {
    setEditor(buildEditorState(selectedAdminRoute));
  }, [selectedAdminRoute]);

  async function handleTestRoute(route: AiModelCatalogRoute) {
    setTestingRouteId(route.routeId);
    setRouteTest(null);
    setError("");
    setMessage("");
    try {
      const result = await testAiRoute(route.routeId);
      setRouteTest(result);
      setMessage(`${route.routeLabel || route.routeKey} 测试${result.status === "ok" ? "成功" : "失败"}。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "线路测试失败。");
    } finally {
      setTestingRouteId("");
    }
  }

  async function handleSaveRoute() {
    if (!selectedAdminRoute) return;
    if (!selectedAdminRoute.tenantId) {
      setError("系统线路暂时只读，请先复制为当前租户线路再编辑。");
      return;
    }

    setSavingRouteId(selectedAdminRoute.id);
    setError("");
    setMessage("");
    try {
      const updatedRoute = await updateAdminRoute(selectedAdminRoute.id, {
        adminNotes: editor.adminNotes.trim() || null,
        apiMode: editor.apiMode.trim() || null,
        connectionId: editor.connectionId || null,
        internalLabel: editor.internalLabel.trim() || null,
        requestPath: editor.requestPath.trim() || null,
        routeLabel: editor.routeLabel.trim() || null,
        status: editor.status,
        upstreamModel: editor.upstreamModel.trim() || null,
      });
      setMessage(`已保存线路：${updatedRoute.routeLabel || updatedRoute.routeKey}`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存线路失败。");
    } finally {
      setSavingRouteId("");
    }
  }

  async function handleDuplicateRoute() {
    if (!selectedAdminRoute) return;
    setActionRouteId(selectedAdminRoute.id);
    setError("");
    setMessage("");
    try {
      const nextRoute = await duplicateAdminRoute(selectedAdminRoute.id, {
        internalLabel: selectedAdminRoute.internalLabel
          ? `${selectedAdminRoute.internalLabel} Copy`
          : "Route Copy",
        routeLabel: selectedAdminRoute.routeLabel
          ? `${selectedAdminRoute.routeLabel} Copy`
          : "线路副本",
      });
      setMessage(`已复制线路：${nextRoute.routeKey}`);
      await refresh();
      setSelectedRouteId(nextRoute.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "复制线路失败。");
    } finally {
      setActionRouteId("");
    }
  }

  async function handleSetDefaultRoute() {
    if (!selectedAdminRoute) return;
    setActionRouteId(selectedAdminRoute.id);
    setError("");
    setMessage("");
    try {
      const nextRoute = await setDefaultAdminRoute(selectedAdminRoute.id);
      setMessage(`已设置默认线路：${nextRoute.routeLabel || nextRoute.routeKey}`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "设置默认线路失败。");
    } finally {
      setActionRouteId("");
    }
  }

  async function handleDeleteRoute() {
    if (!selectedAdminRoute) return;
    const confirmed = window.confirm(`确认删除线路 ${selectedAdminRoute.routeLabel || selectedAdminRoute.routeKey} 吗？`);
    if (!confirmed) return;

    setActionRouteId(selectedAdminRoute.id);
    setError("");
    setMessage("");
    try {
      await deleteAdminRoute(selectedAdminRoute.id);
      setMessage(`已删除线路：${selectedAdminRoute.routeKey}`);
      await refresh();
      setRouteTest(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除线路失败。");
    } finally {
      setActionRouteId("");
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
          <div className="text-xs uppercase tracking-[0.24em] text-sky-300">AI GATEWAY</div>
          <h1 className="mt-2 text-2xl font-semibold text-white">模型与线路管理</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            这里是日常管理入口，只处理产品模型与运行线路。服务商、密钥、底层连接等资源维护放到高级配置页。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={buttonClass}
            onClick={() => navigate(ACCOUNT_PROVIDER_SETTINGS_ROUTE)}
            type="button"
          >
            <Settings2 size={15} />
            高级配置
          </button>
          <button className={buttonClass} onClick={() => void refresh()} type="button">
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
        <MetricCard label="当前模型数" value={models.length} />
        <MetricCard label="当前线路数" value={routes.length} />
        <MetricCard label="当前连接数" value={connections.length} />
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
              setSelectedModelKey("");
              setSelectedRouteId("");
              setRouteTest(null);
            }}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(260px,0.76fr)_minmax(0,1.24fr)]">
        <section className="rounded border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">模型列表</h2>
              <p className="mt-1 text-sm text-slate-400">用户在画布里看到的模型。</p>
            </div>
            <Activity className="text-sky-300" size={20} />
          </div>

          <div className="mt-4 space-y-2">
            {models.map((model) => (
              <button
                className={`w-full rounded border p-4 text-left ${
                  selectedModelKey === model.modelKey
                    ? "border-sky-300/40 bg-sky-400/10"
                    : "border-white/10 bg-black/20 hover:bg-white/[0.06]"
                }`}
                key={model.id}
                onClick={() => {
                  setSelectedModelKey(model.modelKey);
                  setRouteTest(null);
                }}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-white">{model.displayName}</div>
                    <div className="mt-1 text-xs text-slate-500">{model.modelKey}</div>
                  </div>
                  <span className="rounded bg-white/10 px-2 py-1 text-xs text-slate-300">
                    {statusLabel(model.status)}
                  </span>
                </div>
                <div className="mt-3 text-xs text-slate-400">默认线路：{model.defaultRouteKey || "-"}</div>
              </button>
            ))}
            {models.length === 0 && state !== "loading" ? (
              <div className="rounded border border-dashed border-white/10 p-5 text-sm text-slate-400">
                当前分类下还没有可用模型。
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded border border-white/10 bg-white/[0.04] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">线路管理</h2>
              <p className="mt-1 text-sm text-slate-400">直接在这里完成查看、编辑、测试、复制、设默认和删除。</p>
            </div>
            <div className="text-sm text-slate-400">
              {selectedModel ? `${selectedModel.displayName} / ${routes.length} 条线路` : "请选择模型"}
            </div>
          </div>

          {selectedModel ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(290px,0.82fr)_minmax(0,1.18fr)]">
              <div className="space-y-3">
                {routes.map((route) => {
                  const adminRoute = findAdminRouteByKey(adminRoutes, route.routeKey);
                  const isSelected = selectedRouteId === route.routeId;
                  const isDefault = selectedModel.defaultRouteKey === route.routeKey;
                  return (
                    <button
                      className={`w-full rounded border p-4 text-left ${
                        isSelected
                          ? "border-sky-300/40 bg-sky-400/10"
                          : "border-white/10 bg-black/20 hover:bg-white/[0.06]"
                      }`}
                      key={route.routeId}
                      onClick={() => {
                        setSelectedRouteId(route.routeId);
                        setRouteTest(null);
                      }}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-white">{route.routeLabel || route.routeKey}</div>
                          <div className="mt-1 text-xs text-slate-500">{route.routeKey}</div>
                        </div>
                        <span className="rounded bg-white/10 px-2 py-1 text-xs text-slate-300">
                          {isDefault ? "默认" : statusLabel(adminRoute?.status || "active")}
                        </span>
                      </div>
                      <div className="mt-3 space-y-1 text-xs text-slate-400">
                        <div>服务商：{route.providerName}</div>
                        <div>预估价格：{formatCredits(route.estimatedCredits)}</div>
                        <div>线路来源：{adminRoute?.tenantId ? "租户" : "系统"}</div>
                      </div>
                    </button>
                  );
                })}
                {routes.length === 0 ? (
                  <div className="rounded border border-dashed border-white/10 p-5 text-sm text-slate-400">
                    这个模型当前没有可用线路。
                  </div>
                ) : null}
              </div>

              <div className="rounded border border-white/10 bg-black/20 p-4">
                {selectedCatalogRoute && selectedAdminRoute ? (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs tracking-[0.18em] text-slate-500">当前线路</div>
                        <h3 className="mt-1 text-base font-semibold text-white">
                          {selectedCatalogRoute.routeLabel || selectedCatalogRoute.routeKey}
                        </h3>
                        <div className="mt-1 text-xs text-slate-500">{selectedCatalogRoute.routeKey}</div>
                      </div>
                      <span className="rounded bg-white/10 px-2 py-1 text-xs text-slate-300">
                        {selectedModel.defaultRouteKey === selectedCatalogRoute.routeKey
                          ? "默认线路"
                          : selectedAdminRoute.tenantId
                            ? "租户线路"
                            : "系统线路"}
                      </span>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-slate-400">显示线路名称</span>
                        <input
                          className={inputClass}
                          disabled={!selectedAdminRoute.tenantId}
                          onChange={(event) =>
                            setEditor((current) => ({ ...current, routeLabel: event.target.value }))
                          }
                          value={editor.routeLabel}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-slate-400">内部备注名</span>
                        <input
                          className={inputClass}
                          disabled={!selectedAdminRoute.tenantId}
                          onChange={(event) =>
                            setEditor((current) => ({ ...current, internalLabel: event.target.value }))
                          }
                          value={editor.internalLabel}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-slate-400">运行连接</span>
                        <select
                          className={selectClass}
                          disabled={!selectedAdminRoute.tenantId}
                          onChange={(event) =>
                            setEditor((current) => ({ ...current, connectionId: event.target.value }))
                          }
                          value={editor.connectionId}
                        >
                          <option value="">请选择连接</option>
                          {editorConnections.map((connection) => (
                            <option key={connection.id} value={connection.id}>
                              {connection.name} / {connection.environment}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-slate-400">上游模型</span>
                        <input
                          className={inputClass}
                          disabled={!selectedAdminRoute.tenantId}
                          onChange={(event) =>
                            setEditor((current) => ({ ...current, upstreamModel: event.target.value }))
                          }
                          value={editor.upstreamModel}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-slate-400">API 模式</span>
                        <input
                          className={inputClass}
                          disabled={!selectedAdminRoute.tenantId}
                          onChange={(event) =>
                            setEditor((current) => ({ ...current, apiMode: event.target.value }))
                          }
                          value={editor.apiMode}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-slate-400">请求路径</span>
                        <input
                          className={inputClass}
                          disabled={!selectedAdminRoute.tenantId}
                          onChange={(event) =>
                            setEditor((current) => ({ ...current, requestPath: event.target.value }))
                          }
                          value={editor.requestPath}
                        />
                      </label>
                      <label className="block md:col-span-2">
                        <span className="mb-1.5 block text-xs font-medium text-slate-400">管理备注</span>
                        <textarea
                          className="min-h-[96px] w-full rounded border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300/50"
                          disabled={!selectedAdminRoute.tenantId}
                          onChange={(event) =>
                            setEditor((current) => ({ ...current, adminNotes: event.target.value }))
                          }
                          value={editor.adminNotes}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-slate-400">线路状态</span>
                        <select
                          className={selectClass}
                          disabled={!selectedAdminRoute.tenantId}
                          onChange={(event) =>
                            setEditor((current) => ({
                              ...current,
                              status: event.target.value as "active" | "inactive",
                            }))
                          }
                          value={editor.status}
                        >
                          <option value="active">启用</option>
                          <option value="inactive">停用</option>
                        </select>
                      </label>
                      <div className="rounded border border-white/10 bg-white/[0.03] p-3">
                        <div className="text-xs text-slate-500">当前凭证</div>
                        <div className="mt-1 text-sm font-medium text-white">
                          {selectedCredential ? `${selectedCredential.name} ${selectedCredential.maskedSecret}` : "-"}
                        </div>
                      </div>
                    </div>

                    <div className="rounded border border-white/10 bg-white/[0.03] p-4">
                      <div className="mb-3 text-sm font-medium text-white">线路操作</div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className={buttonClass}
                          disabled={!canManage || testingRouteId === selectedCatalogRoute.routeId}
                          onClick={() => void handleTestRoute(selectedCatalogRoute)}
                          type="button"
                        >
                          {testingRouteId === selectedCatalogRoute.routeId ? (
                            <Loader2 className="animate-spin" size={14} />
                          ) : (
                            <FlaskConical size={14} />
                          )}
                          测试
                        </button>
                        <button
                          className={buttonClass}
                          disabled={!canManage || savingRouteId === selectedAdminRoute.id || !selectedAdminRoute.tenantId}
                          onClick={() => void handleSaveRoute()}
                          type="button"
                        >
                          {savingRouteId === selectedAdminRoute.id ? (
                            <Loader2 className="animate-spin" size={14} />
                          ) : (
                            <Save size={14} />
                          )}
                          保存
                        </button>
                        <button
                          className={buttonClass}
                          disabled={!canManage || actionRouteId === selectedAdminRoute.id}
                          onClick={() => void handleDuplicateRoute()}
                          type="button"
                        >
                          {actionRouteId === selectedAdminRoute.id ? (
                            <Loader2 className="animate-spin" size={14} />
                          ) : (
                            <Copy size={14} />
                          )}
                          复制
                        </button>
                        <button
                          className={buttonClass}
                          disabled={
                            !canManage ||
                            actionRouteId === selectedAdminRoute.id ||
                            selectedModel.defaultRouteKey === selectedCatalogRoute.routeKey
                          }
                          onClick={() => void handleSetDefaultRoute()}
                          type="button"
                        >
                          <ArrowRightLeft size={14} />
                          设为默认
                        </button>
                        <button
                          className="inline-flex h-9 items-center gap-2 rounded border border-red-300/25 bg-red-500/10 px-3 text-sm text-red-100 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={
                            !canManage ||
                            actionRouteId === selectedAdminRoute.id ||
                            !selectedAdminRoute.tenantId
                          }
                          onClick={() => void handleDeleteRoute()}
                          type="button"
                        >
                          <Trash2 size={14} />
                          删除
                        </button>
                        <button
                          className={buttonClass}
                          onClick={() => navigate(ACCOUNT_PROVIDER_SETTINGS_ROUTE)}
                          type="button"
                        >
                          <Settings2 size={14} />
                          底层资源页
                        </button>
                      </div>
                    </div>

                    {routeTest ? (
                      <div className="rounded border border-white/10 bg-black/30 p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                          <div className="font-medium text-white">
                            最近测试：{routeTest.status === "ok" ? "成功" : "失败"}
                          </div>
                          <div className="text-xs text-slate-400">{routeTest.latencyMs} ms</div>
                        </div>
                        <JsonPreview
                          value={routeTest.status === "ok" ? routeTest.responseSummary : routeTest.error}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="p-6 text-sm text-slate-400">请选择一条线路。</div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded border border-dashed border-white/10 p-6 text-sm text-slate-400">
              请选择一个模型开始管理线路。
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
