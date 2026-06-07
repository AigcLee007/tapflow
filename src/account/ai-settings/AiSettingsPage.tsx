import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRightLeft,
  Copy,
  FlaskConical,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";

import { ACCOUNT_PROVIDER_SETTINGS_ROUTE } from "../../app/routes";
import { useAuth } from "../../auth/useAuth";
import {
  deleteAdminRoute,
  createAdminRoute,
  duplicateAdminRoute,
  listAdminModels,
  listAdminProviders,
  listAdminCredentials,
  listAdminProviderConnections,
  listAdminRoutes,
  setDefaultAdminRoute,
  type AdminCredential,
  type AdminModel,
  type AdminProvider,
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

type RouteCreateState = RouteEditorState & {
  modelId: string;
  providerId: string;
  routeKey: string;
};

type RouteRow = {
  adminRoute: AdminRoute | null;
  connection: AdminProviderConnection | null;
  isDefault: boolean;
  route: AiModelCatalogRoute;
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
const textareaClass =
  "min-h-[96px] w-full rounded border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300/50";

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
  if (status === "disabled") return "已禁用";
  return status || "-";
}

function routeSourceLabel(route: AdminRoute | null) {
  if (!route) return "未映射";
  return route.tenantId ? "租户线路" : "系统线路";
}

function formatHealthLabel(status?: string | null) {
  if (status === "ok") return "正常";
  if (status === "failed") return "失败";
  if (status === "active") return "可用";
  if (status === "inactive") return "停用";
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

function toChineseIndex(value: number) {
  const labels = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  if (value >= 1 && value <= labels.length) return labels[value - 1];
  return String(value);
}

function deriveRouteKeyPrefix(routeKey: string) {
  if (!routeKey) return "route";
  if (/\.line\d+$/i.test(routeKey)) return routeKey.replace(/\.line\d+$/i, "");
  return routeKey;
}

function findNextRouteIndex(routes: AiModelCatalogRoute[], prefix: string) {
  let maxIndex = 1;
  for (const route of routes) {
    const normalized = route.routeKey ?? "";
    if (normalized === prefix) {
      maxIndex = Math.max(maxIndex, 1);
      continue;
    }
    const match = normalized.match(/\.line(\d+)$/i);
    if (!match) continue;
    if (normalized.replace(/\.line\d+$/i, "") !== prefix) continue;
    maxIndex = Math.max(maxIndex, Number.parseInt(match[1] || "1", 10));
  }
  return maxIndex + 1;
}

function buildCreateState(
  input: {
    defaultApiMode?: string | null;
    defaultConnectionId?: string | null;
    defaultProviderId?: string | null;
    defaultRequestPath?: string | null;
    defaultUpstreamModel?: string | null;
    prefix: string;
    providerModelId?: string | null;
  },
  routes: AiModelCatalogRoute[],
): RouteCreateState {
  const nextIndex = findNextRouteIndex(routes, input.prefix);
  return {
    adminNotes: "",
    apiMode: input.defaultApiMode ?? "",
    connectionId: input.defaultConnectionId ?? "",
    internalLabel: "",
    modelId: input.providerModelId ?? "",
    providerId: input.defaultProviderId ?? "",
    requestPath: input.defaultRequestPath ?? "",
    routeKey: `${input.prefix}.line${nextIndex}`,
    routeLabel: `线路${toChineseIndex(nextIndex)}`,
    status: "active",
    upstreamModel: input.defaultUpstreamModel ?? "",
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
  const [providers, setProviders] = useState<AdminProvider[]>([]);
  const [providerModels, setProviderModels] = useState<AdminModel[]>([]);
  const [connections, setConnections] = useState<AdminProviderConnection[]>([]);
  const [credentials, setCredentials] = useState<AdminCredential[]>([]);
  const [selectedModelKey, setSelectedModelKey] = useState("");
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [routeTest, setRouteTest] = useState<AiRouteTestResult | null>(null);
  const [editor, setEditor] = useState<RouteEditorState>(buildEditorState(null));
  const [createEditor, setCreateEditor] = useState<RouteCreateState | null>(null);
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [testingRouteId, setTestingRouteId] = useState("");
  const [savingRouteId, setSavingRouteId] = useState("");
  const [creatingRoute, setCreatingRoute] = useState(false);
  const [actionRouteId, setActionRouteId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedModel = useMemo(
    () => models.find((model) => model.modelKey === selectedModelKey) ?? null,
    [models, selectedModelKey],
  );

  const routeRows = useMemo<RouteRow[]>(
    () =>
      routes.map((route) => {
        const adminRoute = findAdminRouteByKey(adminRoutes, route.routeKey);
        const connection =
          connections.find((item) => item.id === (adminRoute?.connectionId ?? null)) ?? null;
        return {
          adminRoute,
          connection,
          isDefault: selectedModel?.defaultRouteKey === route.routeKey,
          route,
        };
      }),
    [adminRoutes, connections, routes, selectedModel?.defaultRouteKey],
  );

  const selectedRouteRow = useMemo(
    () => routeRows.find((item) => item.route.routeId === selectedRouteId) ?? null,
    [routeRows, selectedRouteId],
  );

  const selectedCatalogRoute = selectedRouteRow?.route ?? null;
  const selectedAdminRoute = selectedRouteRow?.adminRoute ?? null;
  const selectedConnection = selectedRouteRow?.connection ?? null;
  const selectedCredential = useMemo(
    () =>
      credentials.find((credential) => credential.id === selectedConnection?.credentialId) ?? null,
    [credentials, selectedConnection?.credentialId],
  );
  const selectedProviderName = selectedCatalogRoute?.providerName || "-";
  const isSelectedRouteTenantEditable = Boolean(selectedAdminRoute?.tenantId);
  const isSelectedRouteDefault = Boolean(selectedRouteRow?.isDefault);
  const selectedRouteSource = routeSourceLabel(selectedAdminRoute);

  const selectedRouteEditHint = useMemo(() => {
    if (!selectedAdminRoute) return "请选择一条线路后再管理。";
    if (!isSelectedRouteTenantEditable) {
      return "当前是系统线路，只能查看和测试。需要修改参数时，请先复制成租户线路。";
    }
    if (isSelectedRouteDefault) {
      return "当前是默认线路。你可以直接修改参数；如果要停用，请先把别的线路设为默认。";
    }
    return "当前是租户线路，可以直接修改、停用或删除。";
  }, [isSelectedRouteDefault, isSelectedRouteTenantEditable, selectedAdminRoute]);

  const selectedProviderConnections = useMemo(() => {
    if (!selectedAdminRoute?.providerId) return [];
    return connections.filter(
      (connection) =>
        connection.providerId === selectedAdminRoute.providerId && connection.status === "active",
    );
  }, [connections, selectedAdminRoute?.providerId]);

  const baseRouteForCreate = useMemo(() => {
    if (selectedAdminRoute) return selectedAdminRoute;
    return routeRows.find((item) => item.adminRoute)?.adminRoute ?? null;
  }, [routeRows, selectedAdminRoute]);

  const createConnections = useMemo(() => {
    if (!createEditor?.providerId) return [];
    return connections.filter(
      (connection) => connection.providerId === createEditor.providerId && connection.status === "active",
    );
  }, [connections, createEditor?.providerId]);

  const createProviders = useMemo(
    () => providers.filter((provider) => provider.status === "active"),
    [providers],
  );

  const createModels = useMemo(() => {
    if (!createEditor?.providerId) return [];
    return providerModels.filter(
      (model) => model.providerId === createEditor.providerId && model.modality === activeModality,
    );
  }, [activeModality, createEditor?.providerId, providerModels]);

  const refresh = useCallback(async () => {
    if (!canRead) {
      setState("error");
      setError("当前账号没有访问模型中心的权限。");
      return;
    }

    setState("loading");
    setError("");
    try {
      const [nextModels, nextAdminRoutes, nextProviders, nextProviderModels, nextConnections, nextCredentials] =
        await Promise.all([
        listAiModelCatalog(activeModality),
        listAdminRoutes(),
        listAdminProviders(),
        listAdminModels(),
        listAdminProviderConnections(),
        listAdminCredentials(),
        ]);
      setModels(nextModels);
      setAdminRoutes(nextAdminRoutes);
      setProviders(nextProviders);
      setProviderModels(nextProviderModels);
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
            nextRoutes.find((route) => route.routeKey === selectedModel?.defaultRouteKey) ??
            nextRoutes[0];
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

  useEffect(() => {
    if (!createPanelOpen || !selectedModel) return;
    setCreateEditor((current) => {
      if (current) return current;
      const prefixSource =
        baseRouteForCreate?.routeKey ?? selectedModel.defaultRouteKey ?? `${activeModality}.${selectedModel.modelKey}`;
      const prefix = deriveRouteKeyPrefix(prefixSource);
      const defaultProviderId = baseRouteForCreate?.providerId ?? createProviders[0]?.id ?? "";
      const defaultConnectionId =
        connections.find(
          (connection) => connection.providerId === defaultProviderId && connection.status === "active",
        )?.id ?? "";
      const defaultProviderModelId =
        providerModels.find(
          (model) => model.providerId === defaultProviderId && model.modality === activeModality,
        )?.id ?? "";
      return buildCreateState(
        {
          defaultApiMode: baseRouteForCreate?.apiMode ?? "",
          defaultConnectionId,
          defaultProviderId,
          defaultRequestPath: baseRouteForCreate?.requestPath ?? "",
          defaultUpstreamModel: baseRouteForCreate?.upstreamModel ?? selectedModel.modelKey,
          prefix,
          providerModelId: defaultProviderModelId,
        },
        routes,
      );
    });
  }, [
    activeModality,
    baseRouteForCreate,
    connections,
    createPanelOpen,
    createProviders,
    providerModels,
    routes,
    selectedModel,
  ]);

  useEffect(() => {
    if (!createEditor) return;
    const providerStillExists = createProviders.some((provider) => provider.id === createEditor.providerId);
    if (providerStillExists) return;
    const fallbackProviderId = createProviders[0]?.id ?? "";
    if (fallbackProviderId === createEditor.providerId) return;
    setCreateEditor((current) => {
      if (!current) return current;
      const fallbackConnectionId =
        connections.find(
          (connection) => connection.providerId === fallbackProviderId && connection.status === "active",
        )?.id ?? "";
      const fallbackModelId =
        providerModels.find(
          (model) => model.providerId === fallbackProviderId && model.modality === activeModality,
        )?.id ?? "";
      return {
        ...current,
        connectionId: fallbackConnectionId,
        modelId: fallbackModelId,
        providerId: fallbackProviderId,
      };
    });
  }, [activeModality, connections, createEditor, createProviders, providerModels]);

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

  function openCreatePanel() {
    if (!selectedModel) {
      setError("当前模型还没有可复制的基础线路，请先到高级配置页完成首条线路初始化。");
      return;
    }
    const prefixSource =
      baseRouteForCreate?.routeKey ?? selectedModel.defaultRouteKey ?? `${activeModality}.${selectedModel.modelKey}`;
    const prefix = deriveRouteKeyPrefix(prefixSource);
    const defaultProviderId = baseRouteForCreate?.providerId ?? createProviders[0]?.id ?? "";
    const defaultConnectionId =
      connections.find(
        (connection) => connection.providerId === defaultProviderId && connection.status === "active",
      )?.id ?? "";
    const defaultProviderModelId =
      providerModels.find(
        (model) => model.providerId === defaultProviderId && model.modality === activeModality,
      )?.id ?? "";
    setCreateEditor(
      buildCreateState(
        {
          defaultApiMode: baseRouteForCreate?.apiMode ?? "",
          defaultConnectionId,
          defaultProviderId,
          defaultRequestPath: baseRouteForCreate?.requestPath ?? "",
          defaultUpstreamModel: baseRouteForCreate?.upstreamModel ?? selectedModel.modelKey,
          prefix,
          providerModelId: defaultProviderModelId,
        },
        routes,
      ),
    );
    setCreatePanelOpen(true);
    setError("");
    setMessage("");
  }

  async function handleCreateRoute() {
    if (!selectedModel || !createEditor) return;
    const routeKey = createEditor.routeKey.trim();
    if (!routeKey) {
      setError("请填写线路 Key。");
      return;
    }
    if (routes.some((route) => route.routeKey === routeKey)) {
      setError("线路 Key 已存在，请换一个。");
      return;
    }

    if (!createEditor.providerId) {
      setError("请选择所属服务商。");
      return;
    }
    if (!createEditor.connectionId) {
      setError("请选择运行连接。");
      return;
    }

    setCreatingRoute(true);
    setError("");
    setMessage("");
    try {
      const created = await createAdminRoute({
        adminNotes: createEditor.adminNotes.trim() || null,
        apiMode: createEditor.apiMode.trim() || null,
        connectionId: createEditor.connectionId || null,
        internalLabel: createEditor.internalLabel.trim() || null,
        modality: activeModality,
        modelFamily: selectedModel.modelFamily || selectedModel.modelKey,
        modelId: createEditor.modelId || null,
        providerId: createEditor.providerId,
        requestPath: createEditor.requestPath.trim() || null,
        routeKey,
        routeLabel: createEditor.routeLabel.trim() || null,
        status: createEditor.status,
        upstreamModel: createEditor.upstreamModel.trim() || null,
      });
      setMessage(`已新增线路：${created.routeLabel || created.routeKey}`);
      setCreatePanelOpen(false);
      setCreateEditor(null);
      await refresh();
      setSelectedRouteId(created.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "新增线路失败。");
    } finally {
      setCreatingRoute(false);
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

  async function handleDisableRoute() {
    if (!selectedAdminRoute || !selectedAdminRoute.tenantId) {
      setError("当前线路不可直接停用，请先复制为租户线路后再操作。");
      return;
    }
    setActionRouteId(selectedAdminRoute.id);
    setError("");
    setMessage("");
    try {
      const nextStatus = selectedAdminRoute.status === "inactive" ? "active" : "inactive";
      const updatedRoute = await updateAdminRoute(selectedAdminRoute.id, {
        status: nextStatus,
      });
      setMessage(
        `${updatedRoute.routeLabel || updatedRoute.routeKey} 已${nextStatus === "active" ? "启用" : "停用"}。`,
      );
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新线路状态失败。");
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
              setCreatePanelOpen(false);
              setCreateEditor(null);
            }}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <section className="rounded border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">产品模型</h2>
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
                  setCreatePanelOpen(false);
                  setCreateEditor(null);
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
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">线路管理</h2>
              <p className="mt-1 text-sm text-slate-400">
                先选模型，再集中完成查看、编辑、测试、复制、设为默认、停用和删除。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className={buttonClass}
                disabled={!selectedModel || !canManage}
                onClick={openCreatePanel}
                type="button"
              >
                <Plus size={15} />
                新增线路
              </button>
            </div>
          </div>

          {selectedModel ? (
            <div className="mt-4 space-y-4">
              <div className="rounded border border-white/10 bg-black/20">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-white/10 text-sm">
                    <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                      <tr>
                        <th className="px-4 py-3">线路</th>
                        <th className="px-4 py-3">连接</th>
                        <th className="px-4 py-3">上游模型</th>
                        <th className="px-4 py-3">API 模式</th>
                        <th className="px-4 py-3">预估价格</th>
                        <th className="px-4 py-3">状态</th>
                        <th className="px-4 py-3">来源</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {routeRows.map((item) => {
                        const isSelected = item.route.routeId === selectedRouteId;
                        return (
                          <tr
                            className={`cursor-pointer ${
                              isSelected ? "bg-sky-400/10" : "hover:bg-white/[0.04]"
                            }`}
                            key={item.route.routeId}
                            onClick={() => {
                              setSelectedRouteId(item.route.routeId);
                              setRouteTest(null);
                              setCreatePanelOpen(false);
                            }}
                          >
                            <td className="px-4 py-3 align-top">
                              <div className="font-medium text-white">
                                {item.route.routeLabel || item.route.routeKey}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">{item.route.routeKey}</div>
                              {item.isDefault ? (
                                <span className="mt-2 inline-flex rounded bg-sky-400/15 px-2 py-1 text-[11px] text-sky-200">
                                  默认线路
                                </span>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 align-top text-slate-300">
                              <div>{item.connection?.name || "-"}</div>
                              <div className="mt-1 text-xs text-slate-500">
                                {item.route.providerName}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                环境：{item.connection?.environment || "-"}
                              </div>
                            </td>
                            <td className="px-4 py-3 align-top text-slate-300">
                              {item.adminRoute?.upstreamModel || "-"}
                            </td>
                            <td className="px-4 py-3 align-top text-slate-300">
                              {item.adminRoute?.apiMode || "-"}
                            </td>
                            <td className="px-4 py-3 align-top text-slate-300">
                              {formatCredits(item.route.estimatedCredits)}
                            </td>
                            <td className="px-4 py-3 align-top text-slate-300">
                              {statusLabel(item.adminRoute?.status || "active")}
                            </td>
                            <td className="px-4 py-3 align-top text-slate-300">
                              {routeSourceLabel(item.adminRoute)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {routeRows.length === 0 ? (
                  <div className="border-t border-dashed border-white/10 p-5 text-sm text-slate-400">
                    这个模型当前没有可用线路。请先到高级配置页完成首条线路初始化。
                  </div>
                ) : null}
              </div>

              {createPanelOpen && createEditor ? (
                <div className="rounded border border-sky-300/25 bg-sky-400/10 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-white">新增线路</div>
                      <div className="mt-1 text-xs text-slate-300">
                        直接把新线路挂到当前产品模型下，并单独选择服务商、运行连接、服务商模型和上游调用参数。
                      </div>
                    </div>
                    <button
                      className={buttonClass}
                      onClick={() => {
                        setCreatePanelOpen(false);
                        setCreateEditor(null);
                      }}
                      type="button"
                    >
                      取消
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-slate-300">所属服务商</span>
                      <select
                        className={selectClass}
                        onChange={(event) =>
                          setCreateEditor((current) => {
                            if (!current) return current;
                            const nextProviderId = event.target.value;
                            const nextConnectionId =
                              connections.find(
                                (connection) =>
                                  connection.providerId === nextProviderId && connection.status === "active",
                              )?.id ?? "";
                            const nextModelId =
                              providerModels.find(
                                (model) =>
                                  model.providerId === nextProviderId && model.modality === activeModality,
                              )?.id ?? "";
                            return {
                              ...current,
                              connectionId: nextConnectionId,
                              modelId: nextModelId,
                              providerId: nextProviderId,
                            };
                          })
                        }
                        value={createEditor.providerId}
                      >
                        <option value="">请选择服务商</option>
                        {createProviders.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-slate-300">线路 Key</span>
                      <input
                        className={inputClass}
                        onChange={(event) =>
                          setCreateEditor((current) =>
                            current ? { ...current, routeKey: event.target.value } : current,
                          )
                        }
                        value={createEditor.routeKey}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-slate-300">显示线路名称</span>
                      <input
                        className={inputClass}
                        onChange={(event) =>
                          setCreateEditor((current) =>
                            current ? { ...current, routeLabel: event.target.value } : current,
                          )
                        }
                        value={createEditor.routeLabel}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-slate-300">内部备注名称</span>
                      <input
                        className={inputClass}
                        onChange={(event) =>
                          setCreateEditor((current) =>
                            current ? { ...current, internalLabel: event.target.value } : current,
                          )
                        }
                        value={createEditor.internalLabel}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-slate-300">运行连接</span>
                      <select
                        className={selectClass}
                        disabled={!createEditor.providerId}
                        onChange={(event) =>
                          setCreateEditor((current) =>
                            current ? { ...current, connectionId: event.target.value } : current,
                          )
                        }
                        value={createEditor.connectionId}
                      >
                        <option value="">请选择连接</option>
                        {createConnections.map((connection) => (
                          <option key={connection.id} value={connection.id}>
                            {connection.name} / {connection.environment}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-slate-300">服务商模型</span>
                      <select
                        className={selectClass}
                        disabled={!createEditor.providerId}
                        onChange={(event) =>
                          setCreateEditor((current) =>
                            current ? { ...current, modelId: event.target.value } : current,
                          )
                        }
                        value={createEditor.modelId}
                      >
                        <option value="">不绑定服务商模型</option>
                        {createModels.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.displayName} / {model.modelKey}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-slate-300">上游模型</span>
                      <input
                        className={inputClass}
                        onChange={(event) =>
                          setCreateEditor((current) =>
                            current ? { ...current, upstreamModel: event.target.value } : current,
                          )
                        }
                        value={createEditor.upstreamModel}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-slate-300">API 模式</span>
                      <input
                        className={inputClass}
                        onChange={(event) =>
                          setCreateEditor((current) =>
                            current ? { ...current, apiMode: event.target.value } : current,
                          )
                        }
                        value={createEditor.apiMode}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-slate-300">请求路径</span>
                      <input
                        className={inputClass}
                        onChange={(event) =>
                          setCreateEditor((current) =>
                            current ? { ...current, requestPath: event.target.value } : current,
                          )
                        }
                        value={createEditor.requestPath}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-slate-300">线路状态</span>
                      <select
                        className={selectClass}
                        onChange={(event) =>
                          setCreateEditor((current) =>
                            current
                              ? { ...current, status: event.target.value as "active" | "inactive" }
                              : current,
                          )
                        }
                        value={createEditor.status}
                      >
                        <option value="active">启用</option>
                        <option value="inactive">停用</option>
                      </select>
                    </label>
                    <label className="block md:col-span-2">
                      <span className="mb-1.5 block text-xs font-medium text-slate-300">管理备注</span>
                      <textarea
                        className={textareaClass}
                        onChange={(event) =>
                          setCreateEditor((current) =>
                            current ? { ...current, adminNotes: event.target.value } : current,
                          )
                        }
                        value={createEditor.adminNotes}
                      />
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      className={buttonClass}
                      disabled={!canManage || creatingRoute}
                      onClick={() => void handleCreateRoute()}
                      type="button"
                    >
                      {creatingRoute ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
                      创建线路
                    </button>
                    <button
                      className={buttonClass}
                      onClick={() => navigate(ACCOUNT_PROVIDER_SETTINGS_ROUTE)}
                      type="button"
                    >
                      <Settings2 size={14} />
                      去高级配置页
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_320px]">
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
                          {selectedRouteRow?.isDefault ? "默认线路" : routeSourceLabel(selectedAdminRoute)}
                        </span>
                      </div>

                      <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-slate-300">
                        {selectedRouteEditHint}
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
                          <span className="mb-1.5 block text-xs font-medium text-slate-400">内部备注名称</span>
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
                            disabled
                            onChange={(event) =>
                              setEditor((current) => ({ ...current, connectionId: event.target.value }))
                            }
                            value={editor.connectionId}
                          >
                            <option value="">请选择连接</option>
                            {selectedProviderConnections.map((connection) => (
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
                            disabled={!isSelectedRouteTenantEditable}
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
                            disabled={!isSelectedRouteTenantEditable}
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
                            disabled={!isSelectedRouteTenantEditable}
                            onChange={(event) =>
                              setEditor((current) => ({ ...current, requestPath: event.target.value }))
                            }
                            value={editor.requestPath}
                          />
                        </label>
                        <label className="block md:col-span-2">
                          <span className="mb-1.5 block text-xs font-medium text-slate-400">管理备注</span>
                          <textarea
                            className={textareaClass}
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
                            {selectedCredential
                              ? `${selectedCredential.name} ${selectedCredential.maskedSecret}`
                              : "-"}
                          </div>
                          <button
                            className="mt-3 inline-flex h-8 items-center gap-2 rounded border border-white/10 bg-white/10 px-3 text-xs text-white hover:bg-white/15"
                            onClick={() => navigate(ACCOUNT_PROVIDER_SETTINGS_ROUTE)}
                            type="button"
                          >
                            <Settings2 size={12} />
                            去高级配置页调整连接/凭证
                          </button>
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
                            disabled={!canManage || savingRouteId === selectedAdminRoute.id || !isSelectedRouteTenantEditable}
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
                              isSelectedRouteDefault
                            }
                            onClick={() => void handleSetDefaultRoute()}
                            type="button"
                          >
                            <ArrowRightLeft size={14} />
                            设为默认
                          </button>
                          <button
                            className={buttonClass}
                            disabled={
                              !canManage ||
                              actionRouteId === selectedAdminRoute.id ||
                              !isSelectedRouteTenantEditable ||
                              isSelectedRouteDefault
                            }
                            onClick={() => void handleDisableRoute()}
                            type="button"
                          >
                            <Activity size={14} />
                            {selectedAdminRoute.status === "inactive" ? "启用线路" : "停用线路"}
                          </button>
                          <button
                            className="inline-flex h-9 items-center gap-2 rounded border border-red-300/25 bg-red-500/10 px-3 text-sm text-red-100 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={
                              !canManage ||
                              actionRouteId === selectedAdminRoute.id ||
                              !isSelectedRouteTenantEditable ||
                              isSelectedRouteDefault
                            }
                            onClick={() => void handleDeleteRoute()}
                            type="button"
                          >
                            <Trash2 size={14} />
                            删除
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 text-sm text-slate-400">请选择一条线路。</div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="rounded border border-white/10 bg-black/20 p-4">
                    <div className="text-sm font-medium text-white">线路概览</div>
                    <div className="mt-4 grid gap-2 text-sm text-slate-300">
                      <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-2">
                        线路类型：{selectedRouteSource}
                      </div>
                      <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-2">
                        默认状态：{isSelectedRouteDefault ? "默认线路" : "非默认线路"}
                      </div>
                      <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-2">
                        连接：{selectedConnection?.name || "-"}
                      </div>
                      <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-2">
                        服务商：{selectedProviderName}
                      </div>
                      <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-2">
                        运行环境：{selectedConnection?.environment || "-"}
                      </div>
                      <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-2">
                        连接凭证：{selectedCredential ? selectedCredential.name : "-"}
                      </div>
                      <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-2">
                        上游模型：{selectedAdminRoute?.upstreamModel || "-"}
                      </div>
                      <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-2">
                        API 模式：{selectedAdminRoute?.apiMode || "-"}
                      </div>
                      <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-2">
                        请求路径：{selectedAdminRoute?.requestPath || "-"}
                      </div>
                      <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-2">
                        健康状态：{formatHealthLabel(selectedAdminRoute?.healthStatus)}
                      </div>
                      <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-2">
                        预估价格：{formatCredits(selectedCatalogRoute?.estimatedCredits ?? null)}
                      </div>
                    </div>
                  </div>

                  <div className="rounded border border-white/10 bg-black/20 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-white">测试结果</div>
                      {routeTest ? (
                        <div className="text-xs text-slate-400">{routeTest.latencyMs} ms</div>
                      ) : null}
                    </div>
                    {routeTest ? (
                      <div className="space-y-3">
                        <div className="rounded border border-white/10 bg-white/[0.03] p-3">
                          <div className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                            请求摘要
                          </div>
                          <JsonPreview value={routeTest.requestSummary} />
                        </div>
                        <div className="rounded border border-white/10 bg-white/[0.03] p-3">
                          <div className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                            {routeTest.status === "ok" ? "响应摘要" : "错误详情"}
                          </div>
                          <JsonPreview value={routeTest.status === "ok" ? routeTest.responseSummary : routeTest.error} />
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-400">选择一条线路后点击测试，这里会显示最近一次结果。</div>
                    )}
                  </div>

                  <div className="rounded border border-white/10 bg-black/20 p-4">
                    <div className="text-sm font-medium text-white">职责边界</div>
                    <div className="mt-3 space-y-2 text-sm leading-6 text-slate-400">
                      <p>模型中心负责产品模型和线路的日常管理。</p>
                      <p>这里适合改显示名称、上游模型、API 模式、请求路径、默认线路和启停状态。</p>
                      <p>高级配置页只维护服务商、API Key、连接、底层资源和初始化数据。</p>
                      <p>如果你要换连接、换密钥、改服务商资源，直接去高级配置页处理。</p>
                    </div>
                    <button
                      className="mt-4 inline-flex h-9 items-center gap-2 rounded border border-white/10 bg-white/10 px-3 text-sm text-white hover:bg-white/15"
                      onClick={() => navigate(ACCOUNT_PROVIDER_SETTINGS_ROUTE)}
                      type="button"
                    >
                      <Settings2 size={14} />
                      打开高级配置页
                    </button>
                  </div>
                </div>
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
