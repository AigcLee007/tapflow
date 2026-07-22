export const LOGIN_ROUTE = "/login";
export const REGISTER_ROUTE = "/register";
export const ROOT_ROUTE = "/";
export const HOME_ROUTE = "/home";
export const WORKSPACE_ROUTE = "/workspace";
export const WORKBENCH_ROUTE = "/workbench";
export const PROMPTS_ROUTE = "/prompts";
export const ASSETS_ROUTE = "/assets";
export const BILLING_ROUTE = "/billing";
export const ACCOUNT_ROUTE = "/account";
export const ADMIN_ROUTE = "/admin";
export const ACCOUNT_AI_SETTINGS_ROUTE = "/account/ai-settings";
export const ACCOUNT_PROVIDER_SETTINGS_ROUTE = "/account/provider-settings";
export const ACCOUNT_INSPECTION_ROUTE = "/account/inspection";
export const ACCOUNT_TEMPLATE_LIBRARY_ROUTE = "/account/template-library";

export const PRODUCT_ROUTES = [
  LOGIN_ROUTE,
  REGISTER_ROUTE,
  HOME_ROUTE,
  WORKSPACE_ROUTE,
  WORKBENCH_ROUTE,
  PROMPTS_ROUTE,
  "/projects/:projectId",
  "/projects/:projectId/workbench",
  "/projects/:projectId/canvas",
  ASSETS_ROUTE,
  BILLING_ROUTE,
  ACCOUNT_ROUTE,
] as const;

export function isProjectRoute(pathname: string): boolean {
  return pathname.startsWith("/projects/") && pathname.split("/").filter(Boolean).length >= 2;
}

export function isPromptDetailRoute(pathname: string): boolean {
  return pathname.startsWith(`${PROMPTS_ROUTE}/`) && pathname.split("/").filter(Boolean).length === 2;
}

export function getPromptId(pathname: string): string | null {
  if (!isPromptDetailRoute(pathname)) return null;
  return pathname.split("/").filter(Boolean)[1] ? decodeURIComponent(pathname.split("/").filter(Boolean)[1]) : null;
}

export function getAppRouteTransitionKey(pathname: string): string {
  return pathname === PROMPTS_ROUTE || isPromptDetailRoute(pathname) ? PROMPTS_ROUTE : pathname;
}

export function getProjectId(pathname: string): string | null {
  if (!isProjectRoute(pathname)) return null;
  return pathname.split("/").filter(Boolean)[1] ?? null;
}

export function getProjectRouteParts(pathname: string): {
  mode: "canvas" | "workbench" | null;
  projectId: string | null;
} {
  if (!isProjectRoute(pathname)) {
    return { mode: null, projectId: null };
  }
  const parts = pathname.split("/").filter(Boolean);
  const projectId = parts[1] ? decodeURIComponent(parts[1]) : null;
  const rawMode = parts[2] ?? null;
  const mode = rawMode === "canvas" || rawMode === "workbench" ? rawMode : null;
  return { mode, projectId };
}

export function getProjectMode(pathname: string): "canvas" | "workbench" | null {
  return getProjectRouteParts(pathname).mode;
}

export function isCompatibilityRoute(pathname: string): boolean {
  return pathname.startsWith("/create/flow") || pathname.startsWith("/create/classic");
}

export function isNonUserFacingRoute(pathname: string): boolean {
  return pathname.startsWith("/model-mapping");
}
