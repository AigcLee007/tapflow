export const LOGIN_ROUTE = "/login";
export const REGISTER_ROUTE = "/register";
export const ROOT_ROUTE = "/";
export const WORKSPACE_ROUTE = "/workspace";
export const ASSETS_ROUTE = "/assets";
export const BILLING_ROUTE = "/billing";
export const ACCOUNT_ROUTE = "/account";
export const ADMIN_ROUTE = "/admin";
export const ACCOUNT_PROVIDER_SETTINGS_ROUTE = "/account/provider-settings";

export const PRODUCT_ROUTES = [
  LOGIN_ROUTE,
  REGISTER_ROUTE,
  WORKSPACE_ROUTE,
  "/projects/:projectId",
  ASSETS_ROUTE,
  BILLING_ROUTE,
  ACCOUNT_ROUTE,
] as const;

export function isProjectRoute(pathname: string): boolean {
  return pathname.startsWith("/projects/") && pathname.split("/").filter(Boolean).length >= 2;
}

export function getProjectId(pathname: string): string | null {
  if (!isProjectRoute(pathname)) return null;
  return pathname.split("/").filter(Boolean)[1] ?? null;
}

export function isCompatibilityRoute(pathname: string): boolean {
  return pathname.startsWith("/create/flow") || pathname.startsWith("/create/classic");
}

export function isNonUserFacingRoute(pathname: string): boolean {
  return pathname.startsWith("/model-mapping");
}
