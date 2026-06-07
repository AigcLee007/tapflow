import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, RefreshCw, Settings2, Sparkles } from "lucide-react";

import {
  ACCOUNT_AI_SETTINGS_ROUTE,
  ACCOUNT_PROVIDER_SETTINGS_ROUTE,
  ACCOUNT_ROUTE,
} from "../app/routes";
import { useAuth } from "../auth/useAuth";
import {
  listAdminCredentials,
  listAdminModels,
  listAdminProviderConnections,
  listAdminProviders,
  listAdminRoutes,
  type AdminCredential,
  type AdminModel,
  type AdminProvider,
  type AdminProviderConnection,
  type AdminRoute,
} from "../services/v2AiGatewayAdminApi";
import {
  listAiModelCatalog,
  listAiModelRoutes,
  type AiModelCatalogItem,
  type AiModelCatalogRoute,
} from "../services/v2AiModelCatalogApi";

type LoadState = "idle" | "loading" | "ready" | "error";
type IssueSeverity = "blocking" | "warning";
type InspectionIssue = {
  id: string;
  severity: IssueSeverity;
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
};

const buttonClass =
  "inline-flex h-9 items-center gap-2 rounded border border-white/10 bg-white/10 px-3 text-sm text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50";

function readStringRecordValue(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const item = record[key];
    if (typeof item === "string" && item.trim()) return item.trim();
  }
  return null;
}

function getRouteConnectionId(route: AdminRoute): string | null {
  return (
    route.connectionId ??
    readStringRecordValue(route as unknown as Record<string, unknown>, ["connection_id"]) ??
    readStringRecordValue(route.requestConfig, ["connectionId", "connection_id"]) ??
    null
  );
}

function getRouteCredentialId(route: AdminRoute): string | null {
  return (
    route.credentialId ??
    readStringRecordValue(route as unknown as Record<string, unknown>, ["credential_id"]) ??
    readStringRecordValue(route.requestConfig, ["credentialId", "credential_id"]) ??
    null
  );
}

function hasLegacyDirectRuntime(route: AdminRoute): boolean {
  return Boolean(
    getRouteCredentialId(route) ||
      route.baseUrlOverride ||
      readStringRecordValue(route.requestConfig, ["baseUrl", "base_url"]),
  );
}

function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function buildAiSettingsLink(modelKey?: string | null, routeId?: string | null) {
  const search = new URLSearchParams();
  if (modelKey) search.set("model", modelKey);
  if (routeId) search.set("route", routeId);
  const query = search.toString();
  return query ? `${ACCOUNT_AI_SETTINGS_ROUTE}?${query}` : ACCOUNT_AI_SETTINGS_ROUTE;
}

function buildProviderSettingsLink(input?: {
  providerId?: string | null;
  connectionId?: string | null;
  family?: string | null;
}) {
  const search = new URLSearchParams();
  if (input?.providerId) search.set("provider", input.providerId);
  if (input?.connectionId) search.set("connection", input.connectionId);
  if (input?.family) search.set("family", input.family);
  const query = search.toString();
  return query ? `${ACCOUNT_PROVIDER_SETTINGS_ROUTE}?${query}` : ACCOUNT_PROVIDER_SETTINGS_ROUTE;
}

function MetricCard({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "default" | "danger" | "success";
  value: string | number;
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-400/20 bg-red-500/10"
      : tone === "success"
        ? "border-emerald-400/20 bg-emerald-500/10"
        : "border-white/10 bg-white/[0.04]";

  return (
    <div className={`rounded border p-4 ${toneClass}`}>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

function SectionCard({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className="rounded border border-white/10 bg-white/[0.04] p-5">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ChecklistRow({
  details,
  href,
  label,
  ok,
}: {
  details: string;
  href: string;
  label: string;
  ok: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded border border-white/10 bg-black/20 p-4">
      <div className="min-w-[220px] flex-1">
        <div className="flex items-center gap-2 text-sm font-medium text-white">
          {ok ? <CheckCircle2 className="text-emerald-300" size={16} /> : <AlertTriangle className="text-amber-300" size={16} />}
          {label}
        </div>
        <div className="mt-1 text-sm text-slate-400">{details}</div>
      </div>
      <button className={buttonClass} onClick={() => navigate(href)} type="button">
        查看并处理
      </button>
    </div>
  );
}

function IssueRow({ issue }: { issue: InspectionIssue }) {
  const toneClass =
    issue.severity === "blocking"
      ? "border-red-400/20 bg-red-500/10"
      : "border-amber-400/20 bg-amber-500/10";

  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 rounded border p-4 ${toneClass}`}>
      <div className="min-w-[220px] flex-1">
        <div className="flex items-center gap-2 text-sm font-medium text-white">
          {issue.severity === "blocking" ? (
            <AlertTriangle className="text-red-200" size={16} />
          ) : (
            <AlertTriangle className="text-amber-200" size={16} />
          )}
          {issue.title}
        </div>
        <div className="mt-1 text-sm text-slate-300">{issue.description}</div>
      </div>
      <button className={buttonClass} onClick={() => navigate(issue.actionHref)} type="button">
        {issue.actionLabel}
      </button>
    </div>
  );
}

export function InspectionDashboardPage() {
  const { permissions } = useAuth();
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState("");
  const [providers, setProviders] = useState<AdminProvider[]>([]);
  const [credentials, setCredentials] = useState<AdminCredential[]>([]);
  const [connections, setConnections] = useState<AdminProviderConnection[]>([]);
  const [routes, setRoutes] = useState<AdminRoute[]>([]);
  const [models, setModels] = useState<AdminModel[]>([]);
  const [catalogItems, setCatalogItems] = useState<AiModelCatalogItem[]>([]);
  const [catalogRoutes, setCatalogRoutes] = useState<AiModelCatalogRoute[]>([]);

  const canRead =
    permissions.includes("provider:read") ||
    permissions.includes("provider:manage") ||
    permissions.includes("credential:manage");

  const refresh = useCallback(async () => {
    if (!canRead) {
      setState("error");
      setError("当前账号没有访问巡检面板的权限。");
      return;
    }

    setState("loading");
    setError("");
    try {
      const [
        nextProviders,
        nextCredentials,
        nextConnections,
        nextRoutes,
        nextModels,
        imageCatalog,
        textCatalog,
        videoCatalog,
      ] = await Promise.all([
        listAdminProviders(),
        listAdminCredentials(),
        listAdminProviderConnections(),
        listAdminRoutes(),
        listAdminModels(),
        listAiModelCatalog("image"),
        listAiModelCatalog("text"),
        listAiModelCatalog("video"),
      ]);

      const nextCatalogItems = [...imageCatalog, ...textCatalog, ...videoCatalog];
      const activeCatalogModels = nextCatalogItems.filter((item) => item.status === "active");
      const routeGroups = await Promise.all(
        activeCatalogModels.map((item) => listAiModelRoutes(item.modelKey)),
      );
      const nextCatalogRoutes = Array.from(
        new Map(
          routeGroups
            .flat()
            .map((route) => [route.routeId, route] as const),
        ).values(),
      );

      setProviders(nextProviders);
      setCredentials(nextCredentials);
      setConnections(nextConnections);
      setRoutes(nextRoutes);
      setModels(nextModels);
      setCatalogItems(nextCatalogItems);
      setCatalogRoutes(nextCatalogRoutes);
      setState("ready");
    } catch (cause) {
      setState("error");
      setError(cause instanceof Error ? cause.message : "巡检面板加载失败。");
    }
  }, [canRead]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const providerById = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider])),
    [providers],
  );
  const connectionById = useMemo(
    () => new Map(connections.map((connection) => [connection.id, connection])),
    [connections],
  );
  const credentialById = useMemo(
    () => new Map(credentials.map((credential) => [credential.id, credential])),
    [credentials],
  );

  const activeProviders = useMemo(
    () => providers.filter((provider) => provider.status === "active"),
    [providers],
  );
  const activeConnections = useMemo(
    () => connections.filter((connection) => connection.status === "active"),
    [connections],
  );
  const activeRoutes = useMemo(
    () => routes.filter((route) => route.status === "active" && !route.deletedAt),
    [routes],
  );
  const activeCatalogItems = useMemo(
    () => catalogItems.filter((item) => item.status === "active"),
    [catalogItems],
  );
  const liveAdminRoutes = useMemo(() => {
    const liveRouteIds = new Set(catalogRoutes.map((route) => route.routeId));
    return routes.filter(
      (route) =>
        route.status === "active" &&
        !route.deletedAt &&
        liveRouteIds.has(route.id),
    );
  }, [catalogRoutes, routes]);
  const liveConnections = useMemo(() => {
    const liveConnectionIds = new Set(
      liveAdminRoutes.map((route) => getRouteConnectionId(route)).filter(Boolean) as string[],
    );
    return connections.filter((connection) => liveConnectionIds.has(connection.id));
  }, [connections, liveAdminRoutes]);
  const liveProviders = useMemo(() => {
    const liveProviderIds = new Set(liveAdminRoutes.map((route) => route.providerId));
    return providers.filter((provider) => liveProviderIds.has(provider.id));
  }, [liveAdminRoutes, providers]);
  const liveConnectionBackedRoutes = useMemo(
    () => liveAdminRoutes.filter((route) => Boolean(getRouteConnectionId(route))),
    [liveAdminRoutes],
  );
  const liveLegacyDirectRoutes = useMemo(
    () => liveAdminRoutes.filter((route) => !getRouteConnectionId(route) && hasLegacyDirectRuntime(route)),
    [liveAdminRoutes],
  );

  const issues = useMemo<InspectionIssue[]>(() => {
    const nextIssues: InspectionIssue[] = [];

    for (const item of activeCatalogItems) {
      if (!item.defaultRouteKey) {
        nextIssues.push({
          id: `catalog-default:${item.modelKey}`,
          severity: "blocking",
          title: `${item.displayName} 没有默认线路`,
          description: "这个产品模型已经发布，但还没有默认线路，前台用户提交后会无法稳定落到可用线路。",
          actionHref: buildAiSettingsLink(item.modelKey),
          actionLabel: "去模型中心",
        });
      }
    }

    for (const route of liveAdminRoutes) {
      const provider = providerById.get(route.providerId) ?? null;
      const connectionId = getRouteConnectionId(route);
      const directCredentialId = getRouteCredentialId(route);
      const connection = connectionId ? connectionById.get(connectionId) ?? null : null;
      const credential = connection?.credentialId
        ? credentialById.get(connection.credentialId) ?? null
        : directCredentialId
          ? credentialById.get(directCredentialId) ?? null
          : null;

      if (!connection && !hasLegacyDirectRuntime(route)) {
        nextIssues.push({
          id: `route-connection:${route.id}`,
          severity: "blocking",
          title: `${route.routeLabel || route.routeKey} 未绑定运行连接`,
          description: "线路已经处于启用状态，但没有关联到任何连接，实际上无法请求上游。",
          actionHref: buildAiSettingsLink(route.modelFamily ?? route.routeKey, route.id),
          actionLabel: "修正线路",
        });
        continue;
      }

      if (connection.status !== "active") {
        nextIssues.push({
          id: `route-connection-status:${route.id}`,
          severity: "blocking",
          title: `${route.routeLabel || route.routeKey} 绑定了未启用连接`,
          description: `${connection.name} 当前不是启用状态，这条线路虽然显示可用，但上线后会失败。`,
          actionHref: buildProviderSettingsLink({
            connectionId: connection.id,
            family: route.modelFamily,
            providerId: provider?.id ?? route.providerId,
          }),
          actionLabel: "处理连接",
        });
      }

      if (!credential) {
        nextIssues.push({
          id: `route-credential:${route.id}`,
          severity: "blocking",
          title: `${route.routeLabel || route.routeKey} 缺少凭证`,
          description: "线路已经接到连接，但连接或线路没有有效 API Key，提交后会直接失败。",
          actionHref: buildProviderSettingsLink({
            connectionId: connection.id,
            family: route.modelFamily,
            providerId: provider?.id ?? route.providerId,
          }),
          actionLabel: "补齐凭证",
        });
      }

      if (!route.upstreamModel) {
        nextIssues.push({
          id: `route-upstream:${route.id}`,
          severity: "warning",
          title: `${route.routeLabel || route.routeKey} 未填写上游模型`,
          description: "这条线路没有明确 upstream model，后续排查和跨服务商管理会比较混乱。",
          actionHref: buildAiSettingsLink(route.modelFamily ?? route.routeKey, route.id),
          actionLabel: "完善线路",
        });
      }

      if (route.healthStatus === "failed") {
        nextIssues.push({
          id: `route-health:${route.id}`,
          severity: "warning",
          title: `${route.routeLabel || route.routeKey} 最近健康检查失败`,
          description: "建议重新测试这条线路，确认请求参数、凭证和上游网络状态都正常。",
          actionHref: buildAiSettingsLink(route.modelFamily ?? route.routeKey, route.id),
          actionLabel: "重新检查",
        });
      }
    }

    for (const provider of liveProviders) {
      const providerHasRuntime =
        liveConnections.some((connection) => connection.providerId === provider.id) ||
        liveLegacyDirectRoutes.some((route) => route.providerId === provider.id);
      const providerConnections = liveConnections.filter(
        (connection) => connection.providerId === provider.id,
      );
      if (providerConnections.length === 0) {
        nextIssues.push({
          id: `provider-connections:${provider.id}`,
          severity: providerHasRuntime ? "warning" : "blocking",
          title: `${provider.name} 没有启用中的连接`,
          description: "这个服务商已经存在，但当前没有任何可用连接，后面新增线路时会卡住。",
          actionHref: buildProviderSettingsLink({ providerId: provider.id }),
          actionLabel: "去连接页",
        });
      }

      const providerCredentials = credentials.filter((credential) => credential.providerId === provider.id);
      if (providerCredentials.length === 0) {
        nextIssues.push({
          id: `provider-credentials:${provider.id}`,
          severity: "warning",
          title: `${provider.name} 还没有凭证`,
          description: "服务商存在但没有可选凭证，连接和线路最终都无法真正运行。",
          actionHref: buildProviderSettingsLink({ providerId: provider.id }),
          actionLabel: "添加凭证",
        });
      }
    }

    for (const connection of liveConnections) {
      const usedRoutes = liveAdminRoutes.filter((route) => getRouteConnectionId(route) === connection.id);
      if (usedRoutes.length === 0) {
        nextIssues.push({
          id: `connection-unused:${connection.id}`,
          severity: "warning",
          title: `${connection.name} 还没有挂到任何线路`,
          description: "连接已经创建，但还没有被任何产品模型线路使用，可能是新增一半停住了。",
          actionHref: buildProviderSettingsLink({
            connectionId: connection.id,
            providerId: connection.providerId,
          }),
          actionLabel: "查看连接",
        });
      }

      if (!connection.credentialId) {
        nextIssues.push({
          id: `connection-credential:${connection.id}`,
          severity: "warning",
          title: `${connection.name} 没有关联凭证`,
          description: "这个连接本身还没有绑定 API Key，后续一旦挂线路就会变成阻塞问题。",
          actionHref: buildProviderSettingsLink({
            connectionId: connection.id,
            providerId: connection.providerId,
          }),
          actionLabel: "补齐凭证",
        });
      }
    }

    for (const model of models.filter((item) => item.status === "active")) {
      const relatedRoutes = routes.filter(
        (route) =>
          !route.deletedAt &&
          (route.modelId === model.id || route.modelFamily === model.modelKey),
      );
      if (relatedRoutes.length === 0) {
        nextIssues.push({
          id: `model-routes:${model.id}`,
          severity: "warning",
          title: `${model.displayName} 还没有线路`,
          description: "这个服务商模型已经建好，但还没有落到任何产品模型线路上，管理上会形成空挂项。",
          actionHref: buildProviderSettingsLink({
            providerId: model.providerId,
            family: model.modelKey,
          }),
          actionLabel: "查看映射",
        });
      }
    }

    return nextIssues;
  }, [activeCatalogItems, connectionById, credentialById, credentials, liveAdminRoutes, liveConnections, liveLegacyDirectRoutes, liveProviders, models, providerById, routes]);

  const blockingIssues = useMemo(
    () => issues.filter((issue) => issue.severity === "blocking"),
    [issues],
  );
  const warningIssues = useMemo(
    () => issues.filter((issue) => issue.severity === "warning"),
    [issues],
  );

  const checklistItems = useMemo(() => {
    const modelsMissingDefault = activeCatalogItems.filter((item) => !item.defaultRouteKey).length;
    const routesMissingRuntime = liveAdminRoutes.filter(
      (route) => !getRouteConnectionId(route) && !hasLegacyDirectRuntime(route),
    ).length;
    const routesMissingCredential = liveAdminRoutes.filter((route) => {
      const connectionId = getRouteConnectionId(route);
      const connection = connectionId ? connectionById.get(connectionId) ?? null : null;
      if (!connection) return false;
      const credentialId = connection.credentialId ?? getRouteCredentialId(route) ?? null;
      return !credentialId;
    }).length;
    const providersMissingConnection = liveProviders.filter(
      (provider) =>
        !liveConnections.some((connection) => connection.providerId === provider.id) &&
        !liveLegacyDirectRoutes.some((route) => route.providerId === provider.id),
    ).length;

    return [
      {
        label: "产品模型都已有默认线路",
        ok: modelsMissingDefault === 0,
        details:
          modelsMissingDefault === 0
            ? "当前已发布产品模型都已经落到默认线路。"
            : `还有 ${modelsMissingDefault} 个产品模型没有默认线路。`,
        href: ACCOUNT_AI_SETTINGS_ROUTE,
      },
      {
        label: "\u4e0a\u7ebf\u7ebf\u8def\u90fd\u6709\u8fd0\u884c\u914d\u7f6e",
        ok: routesMissingRuntime === 0,
        details:
          routesMissingRuntime === 0
            ? "\u5f53\u524d\u4e0a\u7ebf\u7ebf\u8def\u90fd\u6709\u8fde\u63a5\u5bf9\u8c61\u6216\u65e7\u5f0f\u76f4\u8fde\u914d\u7f6e\u3002"
            : `\u8fd8\u6709 ${routesMissingRuntime} \u6761\u4e0a\u7ebf\u7ebf\u8def\u7f3a\u5c11\u8fd0\u884c\u914d\u7f6e\u3002`,
        href: ACCOUNT_AI_SETTINGS_ROUTE,
      },
      {
        label: "启用线路都具备凭证",
        ok: routesMissingCredential === 0,
        details:
          routesMissingCredential === 0
            ? "当前启用线路都能拿到有效凭证。"
            : `还有 ${routesMissingCredential} 条启用线路缺少凭证。`,
        href: ACCOUNT_PROVIDER_SETTINGS_ROUTE,
      },
      {
        label: "服务商至少有一个可用连接",
        ok: providersMissingConnection === 0,
        details:
          providersMissingConnection === 0
            ? "每个启用中的服务商都至少有一个可用连接。"
            : `还有 ${providersMissingConnection} 个启用中的服务商没有可用连接。`,
        href: ACCOUNT_PROVIDER_SETTINGS_ROUTE,
      },
    ];
  }, [activeCatalogItems, connectionById, liveAdminRoutes, liveConnections, liveProviders]);

  if (state === "loading" || state === "idle") {
    return (
      <section className="flex min-h-[320px] items-center justify-center rounded border border-white/10 bg-white/[0.04]">
        <div className="inline-flex items-center gap-3 text-sm text-slate-300">
          <Loader2 className="animate-spin" size={16} />
          正在加载巡检面板...
        </div>
      </section>
    );
  }

  if (state === "error") {
    return (
      <section className="rounded border border-red-400/20 bg-red-500/10 p-5 text-sm text-red-100">
        <div className="font-medium">巡检面板加载失败</div>
        <div className="mt-2">{error || "请稍后重试。"}</div>
        <div className="mt-4">
          <button className={buttonClass} onClick={() => void refresh()} type="button">
            <RefreshCw size={14} />
            重新加载
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
            onClick={() => navigate(ACCOUNT_ROUTE)}
            type="button"
          >
            <ArrowLeft size={15} />
            返回账户中心
          </button>
          <div className="mt-3 text-xs uppercase tracking-[0.24em] text-sky-300">Inspection</div>
          <h1 className="mt-2 text-2xl font-semibold text-white">巡检面板</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            这里把服务商、连接、凭证、产品模型和线路的关键异常汇总到一页。上线前先看这里，能更快知道哪些地方还不能交付。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={buttonClass} onClick={() => navigate(ACCOUNT_AI_SETTINGS_ROUTE)} type="button">
            <Sparkles size={14} />
            模型中心
          </button>
          <button className={buttonClass} onClick={() => navigate(ACCOUNT_PROVIDER_SETTINGS_ROUTE)} type="button">
            <Settings2 size={14} />
            高级配置
          </button>
          <button className={buttonClass} onClick={() => void refresh()} type="button">
            <RefreshCw size={14} />
            刷新巡检
          </button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="上线服务商" value={liveProviders.length} />
        <MetricCard label={"\u8fde\u63a5\u5bf9\u8c61\u7ebf\u8def"} value={liveConnectionBackedRoutes.length} />
        <MetricCard label={"\u65e7\u5f0f\u76f4\u8fde\u7ebf\u8def"} value={liveLegacyDirectRoutes.length} />
        <MetricCard label="上线线路" value={liveAdminRoutes.length} />
        <MetricCard label="阻塞异常" tone={blockingIssues.length > 0 ? "danger" : "success"} value={blockingIssues.length} />
        <MetricCard label="提醒项" tone={warningIssues.length > 0 ? "default" : "success"} value={warningIssues.length} />
      </div>

      <SectionCard
        title="上线前检查清单"
        description="这几项都通过时，当前 AI 线路配置才算基本具备上线条件。"
      >
        <div className="space-y-3">
          {checklistItems.map((item) => (
            <ChecklistRow
              key={item.label}
              details={item.details}
              href={item.href}
              label={item.label}
              ok={item.ok}
            />
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard
          title="不能上线的异常"
          description="这些问题会直接导致线路不可用，建议优先清零。"
        >
          <div className="space-y-3">
            {blockingIssues.length > 0 ? (
              blockingIssues.map((issue) => <IssueRow issue={issue} key={issue.id} />)
            ) : (
              <div className="rounded border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                当前没有阻塞上线的异常项。
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="建议尽快处理"
          description="这些问题未必立刻阻塞，但会让后续维护、扩线路和故障排查越来越乱。"
        >
          <div className="space-y-3">
            {warningIssues.length > 0 ? (
              warningIssues.map((issue) => <IssueRow issue={issue} key={issue.id} />)
            ) : (
              <div className="rounded border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                当前没有需要补收口的提醒项。
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </section>
  );
}
