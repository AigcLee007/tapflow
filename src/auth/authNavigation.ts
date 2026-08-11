import { FORGOT_PASSWORD_ROUTE, LOGIN_ROUTE, REGISTER_ROUTE, WORKSPACE_ROUTE } from "../app/routes";

export type AuthMode = "login" | "register" | "forgot-password";

const AUTH_LOOP_PATHS = new Set([LOGIN_ROUTE, REGISTER_ROUTE, FORGOT_PASSWORD_ROUTE]);

export function getSafeReturnTo(search = typeof window === "undefined" ? "" : window.location.search): string {
  const raw = new URLSearchParams(search).get("returnTo");
  if (!raw || typeof window === "undefined") return WORKSPACE_ROUTE;

  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.origin !== window.location.origin || !parsed.pathname.startsWith("/") || AUTH_LOOP_PATHS.has(parsed.pathname)) {
      return WORKSPACE_ROUTE;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return WORKSPACE_ROUTE;
  }
}

export function navigate(path: string): void {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function navigateAuthMode(mode: AuthMode, returnTo = getSafeReturnTo()): void {
  const pathname = mode === "login" ? LOGIN_ROUTE : mode === "register" ? REGISTER_ROUTE : FORGOT_PASSWORD_ROUTE;
  const query = returnTo === WORKSPACE_ROUTE ? "" : `?returnTo=${encodeURIComponent(returnTo)}`;
  navigate(`${pathname}${query}`);
}
