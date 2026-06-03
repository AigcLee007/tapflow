import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";

import { useAuth } from "../auth/useAuth";
import {
  createAdminRedeemCode,
  getAdminWorkflowRun,
  grantAdminCredits,
  listAdminWorkflowRuns,
  resetAdminPassword,
  searchAdminUsers,
  type AdminUser,
  type AdminWorkflowRun,
  type AdminWorkflowRunDetail,
} from "./adminApi";

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded border border-white/10 bg-black/30 p-3 text-xs text-slate-300">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function AdminPage() {
  const { permissions, tenant } = useAuth();
  const isAdmin = permissions.includes("admin:system");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [grantReason, setGrantReason] = useState("staging test credits");
  const [grantCreditsValue, setGrantCreditsValue] = useState("1000");
  const [grantTenantId, setGrantTenantId] = useState("");
  const [grantMessage, setGrantMessage] = useState<string | null>(null);
  const [redeemCreditsValue, setRedeemCreditsValue] = useState("1000");
  const [redeemMaxRedemptions, setRedeemMaxRedemptions] = useState("1");
  const [redeemTenantId, setRedeemTenantId] = useState("");
  const [redeemReason, setRedeemReason] = useState("admin generated test code");
  const [redeemMessage, setRedeemMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [workflowRuns, setWorkflowRuns] = useState<AdminWorkflowRun[]>([]);
  const [workflowStatusFilter, setWorkflowStatusFilter] = useState("");
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRunDetail, setSelectedRunDetail] = useState<AdminWorkflowRunDetail | null>(null);
  const [selectedRunLoading, setSelectedRunLoading] = useState(false);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  const loadUsers = useCallback(async () => {
    if (!isAdmin) {
      setUsers([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await searchAdminUsers(query);
      setUsers(response.items);
      setSelectedUserId((current) => current ?? response.items[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, query]);

  const loadWorkflowRuns = useCallback(async () => {
    if (!isAdmin) {
      setWorkflowRuns([]);
      return;
    }
    setWorkflowLoading(true);
    setWorkflowError(null);
    try {
      const response = await listAdminWorkflowRuns({
        limit: 20,
        status: workflowStatusFilter || undefined,
      });
      setWorkflowRuns(response.items);
      setSelectedRunId((current) => current ?? response.items[0]?.id ?? null);
    } catch (loadError) {
      setWorkflowError(loadError instanceof Error ? loadError.message : "Unable to load workflow runs.");
    } finally {
      setWorkflowLoading(false);
    }
  }, [isAdmin, workflowStatusFilter]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    void loadWorkflowRuns();
  }, [loadWorkflowRuns]);

  useEffect(() => {
    if (!selectedRunId || !isAdmin) {
      setSelectedRunDetail(null);
      return;
    }
    let cancelled = false;
    setSelectedRunLoading(true);
    void getAdminWorkflowRun(selectedRunId)
      .then((detail) => {
        if (!cancelled) {
          setSelectedRunDetail(detail);
        }
      })
      .catch((detailError) => {
        if (!cancelled) {
          setWorkflowError(detailError instanceof Error ? detailError.message : "Unable to load workflow run detail.");
          setSelectedRunDetail(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSelectedRunLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, selectedRunId]);

  useEffect(() => {
    if (selectedUser) {
      setGrantTenantId(selectedUser.memberships[0]?.tenantId ?? tenant?.id ?? "");
      setRedeemTenantId(selectedUser.memberships[0]?.tenantId ?? tenant?.id ?? "");
    }
  }, [selectedUser, tenant?.id]);

  if (!isAdmin) {
    return (
      <section className="rounded border border-amber-400/20 bg-amber-400/10 p-5 text-sm text-amber-100">
        This internal admin console is only available to emails listed in <code>ADMIN_EMAILS</code>.
      </section>
    );
  }

  async function handleGrantCredits() {
    if (!selectedUser || !grantTenantId.trim()) return;
    setGrantMessage(null);
    try {
      const response = await grantAdminCredits({
        credits: Number.parseInt(grantCreditsValue, 10) || 0,
        reason: grantReason,
        targetUserId: selectedUser.id,
        tenantId: grantTenantId.trim(),
      });
      setGrantMessage(
        `Granted successfully. Available ${response.account.availableCredits} pts, reserved ${response.account.reservedCredits} pts.`,
      );
      await loadUsers();
    } catch (grantError) {
      setGrantMessage(grantError instanceof Error ? grantError.message : "Grant credits failed.");
    }
  }

  async function handleCreateRedeemCode() {
    setRedeemMessage(null);
    try {
      const response = await createAdminRedeemCode({
        credits: Number.parseInt(redeemCreditsValue, 10) || 0,
        maxRedemptions: Number.parseInt(redeemMaxRedemptions, 10) || 1,
        reason: redeemReason,
        tenantId: redeemTenantId.trim() || undefined,
      });
      setRedeemMessage(`Redeem code created. Copy now: ${response.code}`);
    } catch (redeemError) {
      setRedeemMessage(redeemError instanceof Error ? redeemError.message : "Create redeem code failed.");
    }
  }

  async function handleResetPassword() {
    if (!selectedUser) return;
    setPasswordMessage(null);
    try {
      const response = await resetAdminPassword({ userId: selectedUser.id });
      setPasswordMessage(`Temporary password for ${response.user.email}: ${response.passwordShownOnce}`);
    } catch (resetError) {
      setPasswordMessage(resetError instanceof Error ? resetError.message : "Reset password failed.");
    }
  }

  const topError = error ?? workflowError;
  const selectedRunError = selectedRunDetail?.workflowRun.errorJson;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-rose-300">Admin</div>
          <h1 className="mt-2 text-2xl font-semibold text-white">Operations Console</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Search users, inspect balances, grant test credits, create redeem codes, reset passwords,
            and inspect recent workflow failures without leaving the authenticated workspace shell.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="inline-flex h-10 items-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15"
            onClick={() => {
              void Promise.all([loadUsers(), loadWorkflowRuns()]);
            }}
            type="button"
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>
      </header>

      {topError ? (
        <div className="rounded border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {topError}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
        <section className="space-y-4 rounded border border-white/10 bg-white/[0.04] p-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
              <input
                className="h-10 w-full rounded border border-white/10 bg-black/25 pl-9 pr-3 text-sm text-white outline-none ring-0 placeholder:text-slate-500"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search email or display name"
                value={query}
              />
            </div>
            <button
              className="inline-flex h-10 items-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15"
              onClick={() => void loadUsers()}
              type="button"
            >
              {loading ? <Loader2 className="animate-spin" size={15} /> : <Search size={15} />}
              Search
            </button>
          </div>

          <div className="space-y-2">
            {users.map((user) => {
              const active = user.id === selectedUserId;
              return (
                <button
                  className={`w-full rounded border px-4 py-3 text-left transition ${
                    active
                      ? "border-sky-300/30 bg-sky-400/10"
                      : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/[0.05]"
                  }`}
                  key={user.id}
                  onClick={() => setSelectedUserId(user.id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-white">{user.displayName || user.email}</div>
                      <div className="text-xs text-slate-400">{user.email}</div>
                    </div>
                    <div className="text-right text-xs text-slate-400">
                      <div>{user.status}</div>
                      <div>{user.memberships.length} tenant(s)</div>
                    </div>
                  </div>
                </button>
              );
            })}
            {!loading && users.length === 0 ? (
              <div className="rounded border border-dashed border-white/10 px-4 py-6 text-sm text-slate-400">
                No users matched the current query.
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-lg font-semibold text-white">Selected User</h2>
            {selectedUser ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded border border-white/10 bg-black/20 p-4 text-sm text-slate-200">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Email</div>
                    <div className="mt-2 break-all">{selectedUser.email}</div>
                  </div>
                  <div className="rounded border border-white/10 bg-black/20 p-4 text-sm text-slate-200">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Status</div>
                    <div className="mt-2">{selectedUser.status}</div>
                  </div>
                </div>

                <div className="space-y-3">
                  {selectedUser.memberships.map((membership) => (
                    <div className="rounded border border-white/10 bg-black/20 p-4" key={membership.tenantId}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-white">{membership.tenantName}</div>
                          <div className="mt-1 text-xs text-slate-400">{membership.tenantId}</div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-right text-sm text-slate-200">
                          <div>
                            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Balance</div>
                            <div className="mt-1">{membership.balanceCredits} pts</div>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Reserved</div>
                            <div className="mt-1">{membership.reservedCredits} pts</div>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Available</div>
                            <div className="mt-1">{membership.availableCredits} pts</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded border border-white/10 bg-black/20 p-4">
                    <h3 className="font-medium text-white">Grant Test Credits</h3>
                    <div className="mt-3 space-y-3">
                      <input
                        className="h-10 w-full rounded border border-white/10 bg-black/25 px-3 text-sm text-white"
                        onChange={(event) => setGrantTenantId(event.target.value)}
                        placeholder="Tenant ID"
                        value={grantTenantId}
                      />
                      <input
                        className="h-10 w-full rounded border border-white/10 bg-black/25 px-3 text-sm text-white"
                        onChange={(event) => setGrantCreditsValue(event.target.value)}
                        placeholder="Credits"
                        value={grantCreditsValue}
                      />
                      <input
                        className="h-10 w-full rounded border border-white/10 bg-black/25 px-3 text-sm text-white"
                        onChange={(event) => setGrantReason(event.target.value)}
                        placeholder="Reason"
                        value={grantReason}
                      />
                      <button
                        className="inline-flex h-10 items-center justify-center rounded border border-emerald-300/25 bg-emerald-500/10 px-4 text-sm text-emerald-100 hover:bg-emerald-500/20"
                        onClick={() => void handleGrantCredits()}
                        type="button"
                      >
                        Grant credits
                      </button>
                      {grantMessage ? <div className="text-sm text-slate-300">{grantMessage}</div> : null}
                    </div>
                  </div>

                  <div className="rounded border border-white/10 bg-black/20 p-4">
                    <h3 className="font-medium text-white">Reset Password</h3>
                    <p className="mt-2 text-sm text-slate-400">
                      Generates a temporary password, activates the user, and marks email verified if needed.
                    </p>
                    <button
                      className="mt-3 inline-flex h-10 items-center justify-center rounded border border-amber-300/25 bg-amber-500/10 px-4 text-sm text-amber-100 hover:bg-amber-500/20"
                      onClick={() => void handleResetPassword()}
                      type="button"
                    >
                      Reset password
                    </button>
                    {passwordMessage ? (
                      <div className="mt-3 rounded border border-white/10 bg-black/30 p-3 text-sm text-slate-200">
                        {passwordMessage}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-slate-400">Select a user to inspect balances and run actions.</div>
            )}
          </div>

          <div className="rounded border border-white/10 bg-white/[0.04] p-5">
            <h2 className="text-lg font-semibold text-white">Create Redeem Code</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <input
                className="h-10 rounded border border-white/10 bg-black/25 px-3 text-sm text-white"
                onChange={(event) => setRedeemTenantId(event.target.value)}
                placeholder="Tenant ID (optional)"
                value={redeemTenantId}
              />
              <input
                className="h-10 rounded border border-white/10 bg-black/25 px-3 text-sm text-white"
                onChange={(event) => setRedeemCreditsValue(event.target.value)}
                placeholder="Credits"
                value={redeemCreditsValue}
              />
              <input
                className="h-10 rounded border border-white/10 bg-black/25 px-3 text-sm text-white"
                onChange={(event) => setRedeemMaxRedemptions(event.target.value)}
                placeholder="Max redemptions"
                value={redeemMaxRedemptions}
              />
              <input
                className="h-10 rounded border border-white/10 bg-black/25 px-3 text-sm text-white md:col-span-2"
                onChange={(event) => setRedeemReason(event.target.value)}
                placeholder="Reason"
                value={redeemReason}
              />
            </div>
            <button
              className="mt-3 inline-flex h-10 items-center justify-center rounded border border-sky-300/25 bg-sky-500/10 px-4 text-sm text-sky-100 hover:bg-sky-500/20"
              onClick={() => void handleCreateRedeemCode()}
              type="button"
            >
              Create redeem code
            </button>
            {redeemMessage ? (
              <div className="mt-3 rounded border border-white/10 bg-black/30 p-3 text-sm text-slate-200">
                {redeemMessage}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="grid gap-4 xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded border border-white/10 bg-white/[0.04] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Recent Workflow Runs</h2>
            <div className="flex gap-2">
              <input
                className="h-10 rounded border border-white/10 bg-black/25 px-3 text-sm text-white"
                onChange={(event) => setWorkflowStatusFilter(event.target.value)}
                placeholder="Status filter"
                value={workflowStatusFilter}
              />
              <button
                className="inline-flex h-10 items-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15"
                onClick={() => void loadWorkflowRuns()}
                type="button"
              >
                {workflowLoading ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
                Refresh
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {workflowRuns.map((run) => {
              const active = run.id === selectedRunId;
              return (
                <button
                  className={`w-full rounded border px-4 py-3 text-left transition ${
                    active
                      ? "border-rose-300/30 bg-rose-400/10"
                      : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/[0.05]"
                  }`}
                  key={run.id}
                  onClick={() => setSelectedRunId(run.id)}
                  type="button"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-white">{run.id}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {run.runMode} / {run.status} / target {run.targetNodeId || "-"}
                      </div>
                      {run.errorSummary ? (
                        <div className="mt-2 text-xs text-rose-200">{run.errorSummary}</div>
                      ) : null}
                    </div>
                    <div className="text-right text-xs text-slate-400">
                      <div>{formatDate(run.createdAt)}</div>
                      <div>{run.failedNodeRunCount} failed node(s)</div>
                    </div>
                  </div>
                </button>
              );
            })}
            {!workflowLoading && workflowRuns.length === 0 ? (
              <div className="rounded border border-dashed border-white/10 px-4 py-6 text-sm text-slate-400">
                No workflow runs matched the current filter.
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">Run Detail</h2>
          {selectedRunLoading ? (
            <div className="mt-4 inline-flex items-center gap-3 text-sm text-slate-300">
              <Loader2 className="animate-spin" size={16} />
              Loading workflow run detail...
            </div>
          ) : selectedRunDetail ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded border border-white/10 bg-black/20 p-4 text-sm text-slate-200">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Status</div>
                  <div className="mt-2">{selectedRunDetail.workflowRun.status}</div>
                </div>
                <div className="rounded border border-white/10 bg-black/20 p-4 text-sm text-slate-200">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Target node</div>
                  <div className="mt-2 break-all">{selectedRunDetail.workflowRun.targetNodeId || "-"}</div>
                </div>
              </div>

              {selectedRunError ? (
                <div>
                  <div className="mb-2 text-sm font-medium text-white">Workflow error_json</div>
                  <JsonBlock value={selectedRunError} />
                </div>
              ) : null}

              <div className="space-y-3">
                {selectedRunDetail.nodeRuns.map((nodeRun) => (
                  <div className="rounded border border-white/10 bg-black/20 p-4" key={nodeRun.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-white">
                          {nodeRun.nodeType} / {nodeRun.nodeId}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {nodeRun.status} / started {formatDate(nodeRun.startedAt)} / finished {formatDate(nodeRun.finishedAt)}
                        </div>
                      </div>
                    </div>
                    {nodeRun.errorJson ? (
                      <div className="mt-3">
                        <div className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">error_json</div>
                        <JsonBlock value={nodeRun.errorJson} />
                      </div>
                    ) : null}
                    {nodeRun.outputSummary ? (
                      <div className="mt-3">
                        <div className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">output summary</div>
                        <pre className="overflow-x-auto rounded border border-white/10 bg-black/30 p-3 text-xs text-slate-300">
                          {nodeRun.outputSummary}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 text-sm text-slate-400">Select a workflow run to inspect failure details.</div>
          )}
        </div>
      </section>
    </div>
  );
}
