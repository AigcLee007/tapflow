import React, { FormEvent, ReactNode, useEffect, useState } from "react";

import { REGISTER_ROUTE, WORKSPACE_ROUTE } from "../app/routes";
import { useAuth } from "./useAuth";

type AuthShellProps = {
  children: ReactNode;
  eyebrow: string;
  heading: string;
  intro: string;
  mode: "login" | "register";
  onSubmit: (event: FormEvent) => void;
};

function getReturnTo() {
  if (typeof window === "undefined") return WORKSPACE_ROUTE;
  const value = new URLSearchParams(window.location.search).get("returnTo");
  if (!value || value.startsWith("/login") || value.startsWith("/register")) {
    return WORKSPACE_ROUTE;
  }
  return value;
}

function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function ProductPreview() {
  return (
    <div className="relative min-h-[320px] overflow-hidden rounded-[22px] border border-white/10 bg-[#080a12]/90 p-4 shadow-[0_24px_72px_rgba(0,0,0,0.4)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_86%_78%,rgba(96,165,250,0.14),transparent_34%)]" />

      <div className="relative flex items-center justify-between border-b border-white/10 pb-3 text-[11px] text-slate-400">
        <span className="font-medium text-white">Creative Flow</span>
        <span>Live draft</span>
      </div>

      <div className="relative mt-4 flex flex-wrap gap-2">
        {["云端项目", "AI 工作流", "素材资产库"].map((label) => (
          <span
            className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-1 text-[11px] font-medium text-slate-200"
            key={label}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="relative mt-4 grid gap-3">
        <div className="w-[74%] rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-300" />
            <span className="text-sm font-medium text-white">项目画布</span>
          </div>
          <div className="h-2 w-4/5 rounded-full bg-white/20" />
          <div className="mt-2 h-2 w-2/3 rounded-full bg-white/10" />
        </div>

        <div className="ml-auto w-[78%] rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.08] p-4 backdrop-blur">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-cyan-100">AI 工作流</span>
            <span className="rounded-full bg-cyan-300 px-2 py-0.5 text-[11px] font-semibold text-slate-950">
              Ready
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="h-12 rounded-xl bg-white/[0.12]" />
            <div className="h-12 rounded-xl bg-white/[0.16]" />
            <div className="h-12 rounded-xl bg-white/10" />
          </div>
        </div>

        <div className="w-[70%] rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
          <div className="mb-3 text-sm font-medium text-white">素材资产库</div>
          <div className="flex gap-2">
            <div className="h-10 w-10 rounded-xl bg-fuchsia-300/30" />
            <div className="h-10 w-10 rounded-xl bg-cyan-300/30" />
            <div className="h-10 w-10 rounded-xl bg-amber-200/30" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthShell({ children, eyebrow, heading, intro, mode, onSubmit }: AuthShellProps) {
  return (
    <main className="min-h-screen overflow-hidden bg-[#07080d] text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_18%,rgba(34,211,238,0.18),transparent_32%),radial-gradient(circle_at_88%_16%,rgba(96,165,250,0.1),transparent_28%),linear-gradient(135deg,#07080d_0%,#11131d_54%,#07080d_100%)]" />
      <div
        className="relative mx-auto flex min-h-screen w-full max-w-[1280px] items-center overflow-hidden px-4 py-4 sm:px-6 lg:px-8"
        data-testid="auth-shell"
      >
        <section
          className="grid w-full items-center gap-4 lg:grid-cols-[1.02fr_380px]"
          data-testid="auth-shell-grid"
        >
          <div className="hidden lg:block">
            <div className="mb-6">
              <div className="mb-3 inline-flex rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] font-medium text-cyan-100">
                TapFlow AI Workspace
              </div>
              <h2 className="max-w-[720px] text-[54px] font-semibold leading-[0.98] text-white">
                把灵感、素材和 AI 模型组织成真正可执行的创作系统。
              </h2>
              <p className="mt-3 max-w-[620px] text-[14px] leading-7 text-slate-300">
                登录后继续管理项目、画布草稿、素材资产和模型线路，让创作流程稳定沉淀在工作区里。
              </p>
            </div>
            <ProductPreview />
          </div>

          <form
            className="mx-auto w-full max-w-[380px] rounded-[22px] border border-white/12 bg-white/[0.075] p-5 shadow-[0_26px_72px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:p-5"
            data-auth-mode={mode}
            onSubmit={onSubmit}
          >
            <div className="mb-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200">
                {eyebrow}
              </div>
              <h1 className="mt-3 text-[30px] font-semibold text-white">{heading}</h1>
              <p className="mt-2 text-[13px] leading-6 text-slate-300">{intro}</p>
            </div>
            {children}
          </form>
        </section>
      </div>
    </main>
  );
}

export function AuthField({
  autoComplete,
  label,
  minLength,
  onChange,
  placeholder,
  required,
  type = "text",
  value,
}: {
  autoComplete?: string;
  label: string;
  minLength?: number;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <label className="mb-3 block text-sm">
      <span className="mb-2 block font-medium text-slate-200">{label}</span>
      <input
        autoComplete={autoComplete}
        className="h-11 w-full rounded-xl border border-white/10 bg-black/25 px-4 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:bg-black/35 focus:ring-2 focus:ring-cyan-300/20"
        minLength={minLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}

export function AuthErrorMessage({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div className="mb-4 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
      {message}
    </div>
  );
}

export function AuthPrimaryButton({
  children,
  disabled,
}: {
  children: ReactNode;
  disabled: boolean;
}) {
  return (
    <button
      className="h-11 w-full rounded-xl bg-cyan-300 font-semibold text-slate-950 shadow-[0_14px_38px_rgba(34,211,238,0.24)] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      type="submit"
    >
      {children}
    </button>
  );
}

export function AuthSecondaryButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="mt-4 w-full rounded-xl px-3 py-2 text-center text-sm font-medium text-cyan-100 transition hover:bg-white/8 hover:text-white"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function LoginPage() {
  const { authenticated, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authenticated && typeof window !== "undefined") {
      navigate(getReturnTo());
    }
  }, [authenticated]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login({
        email,
        password,
      });
      navigate(getReturnTo());
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "登录失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      eyebrow="AI Flow 工作区"
      heading="登录 TapFlow"
      intro="进入工作区，继续你的项目、画布和素材。"
      mode="login"
      onSubmit={handleSubmit}
    >
      <>
        <AuthErrorMessage message={error} />
        <AuthField
          autoComplete="email"
          label="邮箱"
          onChange={setEmail}
          required
          type="email"
          value={email}
        />
        <AuthField
          autoComplete="current-password"
          label="密码"
          minLength={1}
          onChange={setPassword}
          required
          type="password"
          value={password}
        />
        <AuthPrimaryButton disabled={submitting}>
          {submitting ? "正在进入..." : "进入工作区"}
        </AuthPrimaryButton>
        <AuthSecondaryButton onClick={() => navigate(REGISTER_ROUTE)}>创建账号</AuthSecondaryButton>
      </>
    </AuthShell>
  );
}
