import React, { FormEvent, useEffect, useState } from "react";

import { LOGIN_ROUTE, WORKSPACE_ROUTE } from "../app/routes";
import {
  AuthErrorMessage,
  AuthField,
  AuthPrimaryButton,
  AuthSecondaryButton,
  AuthShell,
} from "./LoginPage";
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
    <AuthShell
      eyebrow="创建工作区"
      heading="创建 TapFlow 账号"
      intro="创建你的专属工作区，开始沉淀可复用的 AI 创作流程。"
      mode="register"
      onSubmit={handleSubmit}
    >
      <AuthErrorMessage message={error} />
      <AuthField
        autoComplete="name"
        label="显示名称"
        onChange={setDisplayName}
        value={displayName}
      />
      <AuthField
        autoComplete="email"
        label="邮箱"
        onChange={setEmail}
        required
        type="email"
        value={email}
      />
      <AuthField
        autoComplete="new-password"
        label="密码"
        minLength={8}
        onChange={setPassword}
        required
        type="password"
        value={password}
      />
      <AuthField
        label="工作区名称"
        onChange={setTenantName}
        placeholder="选填"
        value={tenantName}
      />
      <AuthPrimaryButton disabled={submitting}>
        {submitting ? "正在创建..." : "创建账号"}
      </AuthPrimaryButton>
      <AuthSecondaryButton onClick={() => navigate(LOGIN_ROUTE)}>返回登录</AuthSecondaryButton>
    </AuthShell>
  );
}
