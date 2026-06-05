import React, { FormEvent, useEffect, useState } from "react";

import { LOGIN_ROUTE, WORKSPACE_ROUTE } from "../app/routes";
import { useAuth } from "./useAuth";

function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function RegisterPage() {
  const { authenticated, register } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authenticated && typeof window !== "undefined") {
      navigate(WORKSPACE_ROUTE);
    }
  }, [authenticated]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await register({
        displayName: displayName.trim() || undefined,
        email,
        password,
        tenantName: tenantName.trim() || undefined,
      });
      navigate(WORKSPACE_ROUTE);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "注册失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-[#09090f] px-4 py-10 text-slate-100">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded border border-white/10 bg-white/[0.04] p-6 shadow-2xl"
      >
        <div className="mb-6">
          <div className="text-xs uppercase tracking-[0.24em] text-emerald-300">AI Flow 工作区</div>
          <h1 className="mt-3 text-2xl font-semibold">注册</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            创建账号并开通你的专属工作区。
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {error}
          </div>
        )}

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-slate-300">显示名称</span>
          <input
            autoComplete="name"
            className="h-11 w-full rounded border border-white/10 bg-black/30 px-3 text-slate-100 outline-none focus:border-emerald-400"
            onChange={(event) => setDisplayName(event.target.value)}
            value={displayName}
          />
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-slate-300">邮箱</span>
          <input
            autoComplete="email"
            className="h-11 w-full rounded border border-white/10 bg-black/30 px-3 text-slate-100 outline-none focus:border-emerald-400"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-slate-300">密码</span>
          <input
            autoComplete="new-password"
            className="h-11 w-full rounded border border-white/10 bg-black/30 px-3 text-slate-100 outline-none focus:border-emerald-400"
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>

        <label className="mb-5 block text-sm">
          <span className="mb-1 block text-slate-300">工作区名称</span>
          <input
            className="h-11 w-full rounded border border-white/10 bg-black/30 px-3 text-slate-100 outline-none focus:border-emerald-400"
            onChange={(event) => setTenantName(event.target.value)}
            placeholder="选填"
            value={tenantName}
          />
        </label>

        <button
          className="h-11 w-full rounded bg-emerald-400 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={submitting}
          type="submit"
        >
          {submitting ? "创建中..." : "创建账号"}
        </button>

        <button
          className="mt-4 w-full text-center text-sm text-emerald-300 hover:text-emerald-200"
          onClick={() => navigate(LOGIN_ROUTE)}
          type="button"
        >
          返回登录
        </button>
      </form>
    </main>
  );
}
