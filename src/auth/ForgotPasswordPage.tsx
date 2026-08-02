import { useState } from "react";
import { AuthErrorMessage, AuthField, AuthPrimaryButton, AuthSecondaryButton, AuthShell } from "./LoginPage";
import { confirmPasswordReset, requestPasswordReset, resendPasswordReset } from "../services/v2AuthClient";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null); setBusy(true);
    try {
      if (!challengeToken) { const result = await requestPasswordReset({ email }); setChallengeToken(result.challengeToken); }
      else { if (password !== confirm) throw new Error("两次输入的密码不一致"); await confirmPasswordReset({ challengeToken, code, newPassword: password }); window.location.assign("/login?passwordReset=success"); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "操作失败，请稍后重试"); } finally { setBusy(false); }
  }
  return <AuthShell eyebrow="Account recovery" heading="找回密码" intro="输入邮箱获取验证码" mode="forgot-password" onSubmit={submit}>
    <AuthErrorMessage message={error} />
    {!challengeToken ? <AuthField label="邮箱" type="email" value={email} onChange={setEmail} autoComplete="email" /> : <>
      <AuthField label="6 位验证码" value={code} onChange={setCode} inputMode="numeric" maxLength={6} />
      <AuthField label="新密码" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
      <AuthField label="确认新密码" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
    </>}
    <AuthPrimaryButton disabled={busy}>{busy ? "处理中..." : challengeToken ? "重置密码" : "发送验证码"}</AuthPrimaryButton>
    {challengeToken && <AuthSecondaryButton type="button" onClick={() => void resendPasswordReset({ challengeToken })}>重新发送</AuthSecondaryButton>}
  </AuthShell>;
}
