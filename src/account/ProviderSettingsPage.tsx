import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  FlaskConical,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";

import { ACCOUNT_ROUTE } from "../app/routes";
import { useAuth } from "../auth/useAuth";
import {
  createAdminCredential,
  createAdminProvider,
  createAdminProviderConnection,
  deleteAdminProviderConnection,
  listAdminCredentials,
  listAdminModels,
  listAdminProviderConnections,
  listAdminProviders,
  listAdminRoutes,
  rotateAdminCredential,
  type AdminCredential,
  type AdminModel,
  type AdminProvider,
  type AdminProviderConnection,
  type AdminRoute,
  type AiResourceStatus,
  updateAdminProviderConnection,
} from "../services/v2AiGatewayAdminApi";
import { testAiRoute, type AiRouteTestResult } from "../services/v2AiModelCatalogApi";

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

type ConnectionFormState = {
  adapterKind: string;
  baseUrl: string;
  credentialId: string;
  environment: string;
  name: string;
  notes: string;
  providerId: string;
  status: AiResourceStatus;
};

type ConnectionRow = {
  connection: AdminProviderConnection;
  credential: AdminCredential | null;
  provider: AdminProvider | null;
  routes: AdminRoute[];
};

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

function statusLabel(status?: string | null) {
  if (status === "active") return "启用";
  if (status === "inactive") return "停用";
  if (status === "disabled") return "已禁用";
  return status || "-";
}

function healthStatusLabel(status?: string | null) {
  if (status === "ok") return "正常";
  if (status === "failed") return "失败";
  return statusLabel(status);
}

function providerLabel(provider: AdminProvider | null) {
  return provider ? `${provider.name} (${provider.key})` : "-";
}

function credentialLabel(credential: AdminCredential | null) {
  return credential ? `${credential.name} ${credential.maskedSecret}` : "未绑定凭证";
}

function extractNotes(connection: AdminProviderConnection | null) {
  const value = connection?.metadata?.notes;
  return typeof value === "string" ? value : "";
}

function buildConnectionEditor(connection: AdminProviderConnection | null): ConnectionFormState {
  return {
    adapterKind: connection?.adapterKind ?? "",
    baseUrl: connection?.baseUrl ?? "",
    credentialId: connection?.credentialId ?? "",
    environment: connection?.environment ?? "production",
    name: connection?.name ?? "",
    notes: extractNotes(connection),
    providerId: connection?.providerId ?? "",
    status: connection?.status === "inactive" ? "inactive" : "active",
  };
}

function SectionCard({
  children,
  title,
  description,
}: {
  children: React.ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className="rounded border border-white/10 bg-white/[0.04] p-5">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
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
      <span className="mb-1.5 block text-xs font-medium text-slate-400">{label}</span>
      {children}
    </label>
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

export function ProviderSettingsPage() {
  const { permissions } = useAuth();
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [savingProvider, setSavingProvider] = useState(false);
  const [savingCredential, setSavingCredential] = useState(false);
  const [savingConnection, setSavingConnection] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [testingConnectionId, setTestingConnectionId] = useState("");
  const [actionConnectionId, setActionConnectionId] = useState("");

  const [providers, setProviders] = useState<AdminProvider[]>([]);
  const [credentials, setCredentials] = useState<AdminCredential[]>([]);
  const [connections, setConnections] = useState<AdminProviderConnection[]>([]);
  const [routes, setRoutes] = useState<AdminRoute[]>([]);
  const [models, setModels] = useState<AdminModel[]>([]);

  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [routeTest, setRouteTest] = useState<AiRouteTestResult | null>(null);

  const [providerForm, setProviderForm] = useState<ProviderForm>({
    defaultBaseUrl: "https://api.openai.com/v1",
    key: "openai-compatible",
    kind: "openai-compatible",
    name: "OpenAI Compatible",
  });
  const [credentialForm, setCredentialForm] = useState<CredentialForm>({
    name: "默认 API Key",
    providerId: "",
    secret: "",
  });
  const [createConnectionForm, setCreateConnectionForm] = useState<ConnectionFormState>({
    adapterKind: "openai-compatible",
    baseUrl: "",
    credentialId: "",
    environment: "production",
    name: "",
    notes: "",
    providerId: "",
    status: "active",
  });
  const [editConnectionForm, setEditConnectionForm] = useState<ConnectionFormState>(
    buildConnectionEditor(null),
  );
  const [rotateSecret, setRotateSecret] = useState("");

  const canRead =
    permissions.includes("provider:read") ||
    permissions.includes("provider:manage") ||
    permissions.includes("credential:manage");
  const canManage = permissions.includes("provider:manage");
  const canManageCredentials = permissions.includes("credential:manage");

  const connectionRows = useMemo<ConnectionRow[]>(
    () =>
      connections.map((connection) => ({
        connection,
        credential:
          credentials.find((credential) => credential.id === connection.credentialId) ?? null,
        provider: providers.find((provider) => provider.id === connection.providerId) ?? null,
        routes: routes.filter((route) => route.connectionId === connection.id),
      })),
    [connections, credentials, providers, routes],
  );

  const selectedConnectionRow = useMemo(
    () => connectionRows.find((item) => item.connection.id === selectedConnectionId) ?? null,
    [connectionRows, selectedConnectionId],
  );

  const selectedConnection = selectedConnectionRow?.connection ?? null;
  const selectedCredential = selectedConnectionRow?.credential ?? null;
  const selectedProvider = selectedConnectionRow?.provider ?? null;
  const selectedRoutes = selectedConnectionRow?.routes ?? [];

  const connectionCredentialOptions = useMemo(
    () =>
      credentials.filter(
        (credential) => credential.providerId === (createConnectionForm.providerId || selectedConnection?.providerId),
      ),
    [createConnectionForm.providerId, credentials, selectedConnection?.providerId],
  );

  const createProviderCredentials = useMemo(
    () =>
      credentials.filter((credential) => credential.providerId === createConnectionForm.providerId),
    [createConnectionForm.providerId, credentials],
  );

  const refresh = useCallback(async () => {
    if (!canRead) {
      setState("error");
      setError("当前账号没有访问高级配置的权限。");
      return;
    }

    setState("loading");
    setError("");
    try {
      const [nextProviders, nextCredentials, nextConnections, nextRoutes, nextModels] =
        await Promise.all([
          listAdminProviders(),
          listAdminCredentials(),
          listAdminProviderConnections(),
          listAdminRoutes(),
          listAdminModels(),
        ]);

      setProviders(nextProviders);
      setCredentials(nextCredentials);
      setConnections(nextConnections);
      setRoutes(nextRoutes);
      setModels(nextModels);

      const defaultProviderId = nextProviders[0]?.id ?? "";
      setCredentialForm((current) => ({
        ...current,
        providerId: current.providerId || defaultProviderId,
      }));
      setCreateConnectionForm((current) => ({
        ...current,
        credentialId:
          current.credentialId ||
          nextCredentials.find((credential) => credential.providerId === (current.providerId || defaultProviderId))?.id ||
          "",
        providerId: current.providerId || defaultProviderId,
      }));

      setSelectedConnectionId((current) => {
        if (current && nextConnections.some((connection) => connection.id === current)) return current;
        return nextConnections[0]?.id || "";
      });

      setState("ready");
    } catch (cause) {
      setState("error");
      setError(cause instanceof Error ? cause.message : "高级配置数据加载失败。");
    }
  }, [canRead]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setEditConnectionForm(buildConnectionEditor(selectedConnection));
    setRouteTest(null);
    setRotateSecret("");
  }, [selectedConnection]);

  async function handleCreateProvider() {
    if (!providerForm.key.trim() || !providerForm.name.trim() || !providerForm.kind.trim()) {
      setError("请填写服务商 Key、名称和适配器类型。");
      return;
    }

    setSavingProvider(true);
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
      setMessage(`已创建服务商：${provider.name}`);
      setCredentialForm((current) => ({ ...current, providerId: provider.id }));
      setCreateConnectionForm((current) => ({
        ...current,
        adapterKind: provider.kind,
        providerId: provider.id,
      }));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建服务商失败。");
    } finally {
      setSavingProvider(false);
    }
  }

  async function handleCreateCredential() {
    if (!credentialForm.providerId || !credentialForm.name.trim() || !credentialForm.secret.trim()) {
      setError("请选择服务商，并填写凭证名称和 API Key。");
      return;
    }

    setSavingCredential(true);
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
      setCreateConnectionForm((current) => ({
        ...current,
        credentialId: credential.id,
        providerId: credential.providerId,
      }));
      setMessage(`已创建凭证：${credential.name}`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建凭证失败。");
    } finally {
      setSavingCredential(false);
    }
  }

  async function handleCreateConnection() {
    if (!createConnectionForm.providerId || !createConnectionForm.name.trim() || !createConnectionForm.adapterKind.trim()) {
      setError("请填写连接名称、服务商和适配器类型。");
      return;
    }

    setSavingConnection(true);
    setError("");
    setMessage("");
    try {
      const connection = await createAdminProviderConnection({
        adapterKind: createConnectionForm.adapterKind.trim(),
        baseUrl: createConnectionForm.baseUrl.trim() || null,
        credentialId: createConnectionForm.credentialId || null,
        environment: createConnectionForm.environment.trim() || "production",
        metadata: createConnectionForm.notes.trim()
          ? { notes: createConnectionForm.notes.trim() }
          : {},
        name: createConnectionForm.name.trim(),
        providerId: createConnectionForm.providerId,
        status: createConnectionForm.status,
      });
      setMessage(`已创建连接：${connection.name}`);
      setCreateConnectionForm((current) => ({
        ...current,
        baseUrl: "",
        name: "",
        notes: "",
      }));
      await refresh();
      setSelectedConnectionId(connection.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建连接失败。");
    } finally {
      setSavingConnection(false);
    }
  }

  async function handleSaveConnection() {
    if (!selectedConnection) return;
    if (!editConnectionForm.name.trim() || !editConnectionForm.adapterKind.trim()) {
      setError("请填写连接名称和适配器类型。");
      return;
    }

    setSavingConnection(true);
    setError("");
    setMessage("");
    try {
      const connection = await updateAdminProviderConnection(selectedConnection.id, {
        adapterKind: editConnectionForm.adapterKind.trim(),
        baseUrl: editConnectionForm.baseUrl.trim() || null,
        credentialId: editConnectionForm.credentialId || null,
        environment: editConnectionForm.environment.trim() || "production",
        metadata: editConnectionForm.notes.trim() ? { notes: editConnectionForm.notes.trim() } : {},
        name: editConnectionForm.name.trim(),
        status: editConnectionForm.status,
      });
      setMessage(`已保存连接：${connection.name}`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存连接失败。");
    } finally {
      setSavingConnection(false);
    }
  }

  async function handleToggleConnectionStatus() {
    if (!selectedConnection) return;
    setActionConnectionId(selectedConnection.id);
    setError("");
    setMessage("");
    try {
      const nextStatus: AiResourceStatus =
        selectedConnection.status === "inactive" ? "active" : "inactive";
      const updated = await updateAdminProviderConnection(selectedConnection.id, {
        status: nextStatus,
      });
      setMessage(`${updated.name} 已${nextStatus === "active" ? "启用" : "停用"}。`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新连接状态失败。");
    } finally {
      setActionConnectionId("");
    }
  }

  async function handleDeleteConnection() {
    if (!selectedConnection) return;
    const confirmed = window.confirm(`确认删除连接 ${selectedConnection.name} 吗？`);
    if (!confirmed) return;

    setActionConnectionId(selectedConnection.id);
    setError("");
    setMessage("");
    try {
      await deleteAdminProviderConnection(selectedConnection.id);
      setMessage(`已删除连接：${selectedConnection.name}`);
      await refresh();
      setRouteTest(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除连接失败。");
    } finally {
      setActionConnectionId("");
    }
  }

  async function handleTestConnection() {
    if (!selectedConnection) return;
    const testRoute = selectedRoutes.find((route) => route.status === "active") ?? selectedRoutes[0] ?? null;
    if (!testRoute) {
      setError("当前连接还没有绑定任何可测试线路，请先在模型中心把线路接到这个连接上。");
      return;
    }

    setTestingConnectionId(selectedConnection.id);
    setError("");
    setMessage("");
    setRouteTest(null);
    try {
      const result = await testAiRoute(testRoute.id);
      setRouteTest(result);
      setMessage(`${selectedConnection.name} 测试${result.status === "ok" ? "成功" : "失败"}。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "连接测试失败。");
    } finally {
      setTestingConnectionId("");
    }
  }

  async function handleRotateCredential() {
    if (!selectedCredential || !rotateSecret.trim()) {
      setError("请先选择绑定了凭证的连接，并输入新的 API Key。");
      return;
    }

    setRotating(true);
    setError("");
    setMessage("");
    try {
      const credential = await rotateAdminCredential(selectedCredential.id, rotateSecret.trim());
      setRotateSecret("");
      setMessage(`已更新凭证：${credential.name}`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新凭证失败。");
    } finally {
      setRotating(false);
    }
  }

  if (!canRead) {
    return (
      <section className="rounded border border-amber-400/20 bg-amber-400/10 p-5 text-sm text-amber-100">
        当前账号没有访问高级配置的权限。
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-sky-300">高级配置</div>
          <h1 className="mt-2 text-2xl font-semibold text-white">Provider Connections</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            这里专门管理服务商、凭证和连接资源。模型、线路、默认线路这些日常操作已经收口到模型中心。
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

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="服务商数" value={providers.length} />
        <MetricCard label="凭证数" value={credentials.length} />
        <MetricCard label="连接数" value={connections.length} />
        <MetricCard
          label="已被线路复用的连接"
          value={connectionRows.filter((item) => item.routes.length > 1).length}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <SectionCard
          title="连接列表"
          description="同一个连接可以被多条线路复用。停用连接后，模型中心不会再把它作为新的可选连接。"
        >
          <div className="mt-4 space-y-2">
            {connectionRows.map((item) => {
              const isSelected = item.connection.id === selectedConnectionId;
              return (
                <button
                  className={`w-full rounded border p-4 text-left ${
                    isSelected
                      ? "border-sky-300/40 bg-sky-400/10"
                      : "border-white/10 bg-black/20 hover:bg-white/[0.06]"
                  }`}
                  key={item.connection.id}
                  onClick={() => setSelectedConnectionId(item.connection.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-white">{item.connection.name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {providerLabel(item.provider)}
                      </div>
                    </div>
                    <span className="rounded bg-white/10 px-2 py-1 text-xs text-slate-300">
                      {statusLabel(item.connection.status)}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-slate-400">
                    <div>适配器：{item.connection.adapterKind}</div>
                    <div>凭证：{credentialLabel(item.credential)}</div>
                    <div>复用线路：{item.routes.length} 条</div>
                  </div>
                </button>
              );
            })}
            {connectionRows.length === 0 && state !== "loading" ? (
              <div className="rounded border border-dashed border-white/10 p-5 text-sm text-slate-400">
                当前还没有任何连接。
              </div>
            ) : null}
          </div>
        </SectionCard>

        <div className="space-y-5">
          <SectionCard
            title="连接详情"
            description="在这里编辑连接、测试连接、停用连接、删除连接，以及为已绑定凭证的连接旋转 API Key。"
          >
            {selectedConnection ? (
              <div className="mt-4 space-y-5">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="连接名称">
                    <input
                      className={inputClass}
                      onChange={(event) =>
                        setEditConnectionForm((current) => ({ ...current, name: event.target.value }))
                      }
                      value={editConnectionForm.name}
                    />
                  </Field>
                  <Field label="服务商">
                    <input
                      className={inputClass}
                      disabled
                      value={selectedProvider ? providerLabel(selectedProvider) : "-"}
                    />
                  </Field>
                  <Field label="适配器类型">
                    <input
                      className={inputClass}
                      onChange={(event) =>
                        setEditConnectionForm((current) => ({
                          ...current,
                          adapterKind: event.target.value,
                        }))
                      }
                      value={editConnectionForm.adapterKind}
                    />
                  </Field>
                  <Field label="运行环境">
                    <input
                      className={inputClass}
                      onChange={(event) =>
                        setEditConnectionForm((current) => ({
                          ...current,
                          environment: event.target.value,
                        }))
                      }
                      value={editConnectionForm.environment}
                    />
                  </Field>
                  <Field label="Base URL">
                    <input
                      className={inputClass}
                      onChange={(event) =>
                        setEditConnectionForm((current) => ({ ...current, baseUrl: event.target.value }))
                      }
                      placeholder="https://api.example.com/v1"
                      value={editConnectionForm.baseUrl}
                    />
                  </Field>
                  <Field label="绑定凭证">
                    <select
                      className={selectClass}
                      onChange={(event) =>
                        setEditConnectionForm((current) => ({
                          ...current,
                          credentialId: event.target.value,
                        }))
                      }
                      value={editConnectionForm.credentialId}
                    >
                      <option value="">不绑定凭证</option>
                      {connectionCredentialOptions.map((credential) => (
                        <option key={credential.id} value={credential.id}>
                          {credential.name} {credential.maskedSecret}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="连接状态">
                    <select
                      className={selectClass}
                      onChange={(event) =>
                        setEditConnectionForm((current) => ({
                          ...current,
                          status: event.target.value as AiResourceStatus,
                        }))
                      }
                      value={editConnectionForm.status}
                    >
                      <option value="active">启用</option>
                      <option value="inactive">停用</option>
                    </select>
                  </Field>
                  <Field label="连接备注">
                    <textarea
                      className={textareaClass}
                      onChange={(event) =>
                        setEditConnectionForm((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                      value={editConnectionForm.notes}
                    />
                  </Field>
                </div>

                <div className="grid gap-2 rounded border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400 md:grid-cols-2">
                  <div>当前凭证：{credentialLabel(selectedCredential)}</div>
                  <div>最近健康状态：{healthStatusLabel(selectedConnection.lastHealthStatus)}</div>
                  <div>最近检测时间：{selectedConnection.lastHealthCheckedAt || "-"}</div>
                  <div>复用线路数：{selectedRoutes.length}</div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded bg-sky-400 px-4 text-sm font-semibold text-slate-950 hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canManage || savingConnection}
                    onClick={() => void handleSaveConnection()}
                    type="button"
                  >
                    {savingConnection ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
                    保存连接
                  </button>
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canManage || testingConnectionId === selectedConnection.id}
                    onClick={() => void handleTestConnection()}
                    type="button"
                  >
                    {testingConnectionId === selectedConnection.id ? (
                      <Loader2 className="animate-spin" size={15} />
                    ) : (
                      <FlaskConical size={15} />
                    )}
                    测试连接
                  </button>
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canManage || actionConnectionId === selectedConnection.id}
                    onClick={() => void handleToggleConnectionStatus()}
                    type="button"
                  >
                    <Settings2 size={15} />
                    {selectedConnection.status === "inactive" ? "启用连接" : "停用连接"}
                  </button>
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded border border-red-300/25 bg-red-500/10 px-4 text-sm text-red-100 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canManage || actionConnectionId === selectedConnection.id}
                    onClick={() => void handleDeleteConnection()}
                    type="button"
                  >
                    <Trash2 size={15} />
                    删除连接
                  </button>
                </div>

                <div className="rounded border border-white/10 bg-black/20 p-4">
                  <div className="text-sm font-medium text-white">旋转连接密钥</div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    这里只显示掩码后的凭证。真正的 API Key 只会加密保存，不会回显到前端。
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <input
                      className={inputClass}
                      disabled={!selectedCredential}
                      onChange={(event) => setRotateSecret(event.target.value)}
                      placeholder={selectedCredential ? "输入新的 API Key" : "当前连接未绑定凭证"}
                      type="password"
                      value={rotateSecret}
                    />
                    <button
                      className="inline-flex h-10 items-center justify-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!canManageCredentials || !selectedCredential || rotating}
                      onClick={() => void handleRotateCredential()}
                      type="button"
                    >
                      {rotating ? <Loader2 className="animate-spin" size={15} /> : <KeyRound size={15} />}
                      更新凭证
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded border border-dashed border-white/10 p-6 text-sm text-slate-400">
                请选择一个连接开始管理。
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="连接被哪些线路复用"
            description="这个视图用来确认一个连接是否已经被多条线路复用，也方便理解删除连接时为什么会被拦截。"
          >
            {selectedRoutes.length > 0 ? (
              <div className="mt-4 space-y-2">
                {selectedRoutes.map((route) => {
                  const model = models.find((item) => item.id === route.modelId) ?? null;
                  return (
                    <div
                      className="rounded border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300"
                      key={route.id}
                    >
                      <div className="font-medium text-white">{route.routeLabel || route.routeKey}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {model ? `${model.displayName} (${model.modelKey})` : "未绑定模型"} / {route.routeKey}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 rounded border border-dashed border-white/10 p-5 text-sm text-slate-400">
                当前连接还没有被任何线路使用。
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="最近测试结果"
            description="连接测试会复用当前连接已绑定的一条线路执行健康检查，所以可以看到真实的上游调用结果。"
          >
            {routeTest ? (
              <div className="mt-4 space-y-3">
                <div className="rounded border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                    请求摘要
                  </div>
                  <pre className="max-h-56 overflow-auto text-xs leading-5 text-slate-300">
                    {JSON.stringify(routeTest.requestSummary, null, 2)}
                  </pre>
                </div>
                <div className="rounded border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                    {routeTest.status === "ok" ? "响应摘要" : "错误详情"}
                  </div>
                  <pre className="max-h-56 overflow-auto text-xs leading-5 text-slate-300">
                    {JSON.stringify(routeTest.status === "ok" ? routeTest.responseSummary : routeTest.error, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded border border-dashed border-white/10 p-5 text-sm text-slate-400">
                选择一个连接并点击“测试连接”后，这里会显示结果。
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <SectionCard
          title="创建服务商"
          description="只有当现有服务商不够用时，才需要新建服务商定义。"
        >
          <div className="mt-4 grid gap-3">
            <Field label="服务商 Key">
              <input
                className={inputClass}
                onChange={(event) =>
                  setProviderForm((current) => ({ ...current, key: event.target.value }))
                }
                value={providerForm.key}
              />
            </Field>
            <Field label="显示名称">
              <input
                className={inputClass}
                onChange={(event) =>
                  setProviderForm((current) => ({ ...current, name: event.target.value }))
                }
                value={providerForm.name}
              />
            </Field>
            <Field label="适配器类型">
              <input
                className={inputClass}
                onChange={(event) =>
                  setProviderForm((current) => ({ ...current, kind: event.target.value }))
                }
                value={providerForm.kind}
              />
            </Field>
            <Field label="默认 Base URL">
              <input
                className={inputClass}
                onChange={(event) =>
                  setProviderForm((current) => ({
                    ...current,
                    defaultBaseUrl: event.target.value,
                  }))
                }
                placeholder="https://api.openai.com/v1"
                value={providerForm.defaultBaseUrl}
              />
            </Field>
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded bg-sky-400 px-4 text-sm font-semibold text-slate-950 hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canManage || savingProvider}
              onClick={() => void handleCreateProvider()}
              type="button"
            >
              {savingProvider ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}
              创建服务商
            </button>
          </div>
        </SectionCard>

        <SectionCard
          title="创建凭证"
          description="API Key 只会加密保存，页面只显示掩码。"
        >
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
                onChange={(event) =>
                  setCredentialForm((current) => ({ ...current, name: event.target.value }))
                }
                value={credentialForm.name}
              />
            </Field>
            <Field label="API Key">
              <input
                className={inputClass}
                onChange={(event) =>
                  setCredentialForm((current) => ({ ...current, secret: event.target.value }))
                }
                placeholder="只会加密保存，不会明文展示"
                type="password"
                value={credentialForm.secret}
              />
            </Field>
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded bg-sky-400 px-4 text-sm font-semibold text-slate-950 hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canManageCredentials || savingCredential}
              onClick={() => void handleCreateCredential()}
              type="button"
            >
              {savingCredential ? <Loader2 className="animate-spin" size={15} /> : <KeyRound size={15} />}
              保存凭证
            </button>
          </div>
        </SectionCard>

        <SectionCard
          title="创建连接"
          description="连接是给线路复用的真正运行资源。一个连接可被多条线路共用。"
        >
          <div className="mt-4 grid gap-3">
            <Field label="连接名称">
              <input
                className={inputClass}
                onChange={(event) =>
                  setCreateConnectionForm((current) => ({ ...current, name: event.target.value }))
                }
                value={createConnectionForm.name}
              />
            </Field>
            <Field label="服务商">
              <select
                className={selectClass}
                onChange={(event) => {
                  const provider = providers.find((item) => item.id === event.target.value) ?? null;
                  setCreateConnectionForm((current) => ({
                    ...current,
                    adapterKind: provider?.kind ?? current.adapterKind,
                    credentialId: "",
                    providerId: event.target.value,
                  }));
                }}
                value={createConnectionForm.providerId}
              >
                <option value="">请选择服务商</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name} ({provider.key})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="适配器类型">
              <input
                className={inputClass}
                onChange={(event) =>
                  setCreateConnectionForm((current) => ({
                    ...current,
                    adapterKind: event.target.value,
                  }))
                }
                value={createConnectionForm.adapterKind}
              />
            </Field>
            <Field label="绑定凭证">
              <select
                className={selectClass}
                onChange={(event) =>
                  setCreateConnectionForm((current) => ({
                    ...current,
                    credentialId: event.target.value,
                  }))
                }
                value={createConnectionForm.credentialId}
              >
                <option value="">不绑定凭证</option>
                {createProviderCredentials.map((credential) => (
                  <option key={credential.id} value={credential.id}>
                    {credential.name} {credential.maskedSecret}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Base URL">
              <input
                className={inputClass}
                onChange={(event) =>
                  setCreateConnectionForm((current) => ({ ...current, baseUrl: event.target.value }))
                }
                placeholder="https://api.example.com/v1"
                value={createConnectionForm.baseUrl}
              />
            </Field>
            <Field label="运行环境">
              <input
                className={inputClass}
                onChange={(event) =>
                  setCreateConnectionForm((current) => ({
                    ...current,
                    environment: event.target.value,
                  }))
                }
                value={createConnectionForm.environment}
              />
            </Field>
            <Field label="备注">
              <textarea
                className={textareaClass}
                onChange={(event) =>
                  setCreateConnectionForm((current) => ({ ...current, notes: event.target.value }))
                }
                value={createConnectionForm.notes}
              />
            </Field>
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded bg-sky-400 px-4 text-sm font-semibold text-slate-950 hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canManage || savingConnection}
              onClick={() => void handleCreateConnection()}
              type="button"
            >
              {savingConnection ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}
              创建连接
            </button>
          </div>
        </SectionCard>
      </div>
    </section>
  );
}
