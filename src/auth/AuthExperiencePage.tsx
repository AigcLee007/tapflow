import React, { useEffect, useState } from "react";

import { FORGOT_PASSWORD_ROUTE, LOGIN_ROUTE, REGISTER_ROUTE, WORKSPACE_ROUTE } from "../app/routes";
import { AuthDialog } from "./AuthDialog";
import { navigateAuthMode, type AuthMode } from "./authNavigation";
import { ForgotPasswordPanel } from "./ForgotPasswordPage";
import { LoginPanel } from "./LoginPage";
import { RegisterPanel } from "./RegisterPage";
import { FilmStage } from "./landing/FilmStage";
import { useAuth } from "./useAuth";

function getAuthMode(pathname: string): AuthMode {
  if (pathname === REGISTER_ROUTE) return "register";
  if (pathname === FORGOT_PASSWORD_ROUTE) return "forgot-password";
  return "login";
}

function getDialogTitle(mode: AuthMode): string {
  if (mode === "register") return "创建账号";
  if (mode === "forgot-password") return "重置密码";
  return "欢迎回来";
}

function getDialogContent(mode: AuthMode, onModeChange: (mode: AuthMode) => void, onPendingChange: (pending: boolean) => void) {
  if (mode === "register") return <RegisterPanel onModeChange={onModeChange} onPendingChange={onPendingChange} />;
  if (mode === "forgot-password") return <ForgotPasswordPanel onModeChange={onModeChange} onPendingChange={onPendingChange} />;
  return <LoginPanel onModeChange={onModeChange} onPendingChange={onPendingChange} />;
}

export function AuthExperiencePage() {
  const { authenticated } = useAuth();
  const [openedFromStage, setOpenedFromStage] = useState(false);
  const [pending, setPending] = useState(false);
  const pathname = typeof window === "undefined" ? LOGIN_ROUTE : window.location.pathname;
  const search = typeof window === "undefined" ? "" : window.location.search;
  const mode = getAuthMode(pathname);
  const opensFromRoute = pathname === REGISTER_ROUTE || pathname === FORGOT_PASSWORD_ROUTE || new URLSearchParams(search).get("passwordReset") === "success";
  const dialogOpen = opensFromRoute || openedFromStage;

  useEffect(() => {
    if (pathname !== LOGIN_ROUTE) setOpenedFromStage(false);
  }, [pathname]);

  const handleModeChange = (nextMode: AuthMode) => {
    setOpenedFromStage(false);
    navigateAuthMode(nextMode);
  };

  const handleClose = () => {
    if (pending) return;
    if (opensFromRoute) {
      setOpenedFromStage(false);
      navigateAuthMode("login");
      return;
    }
    setOpenedFromStage(false);
  };

  const handleEnterWorkspace = () => {
    if (authenticated) {
      window.history.pushState(null, "", WORKSPACE_ROUTE);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    }
    setOpenedFromStage(true);
  };

  return (
    <>
      <FilmStage dialogOpen={dialogOpen} onEnterWorkspace={handleEnterWorkspace} onOpenAuth={() => setOpenedFromStage(true)} />
      <AuthDialog focusKey={mode} onClose={handleClose} open={dialogOpen} pending={pending} title={getDialogTitle(mode)}>
        {getDialogContent(mode, handleModeChange, setPending)}
      </AuthDialog>
    </>
  );
}
