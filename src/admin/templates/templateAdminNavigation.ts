export const TEMPLATE_ADMIN_ROUTE = "/admin/templates";

export function getTemplateAdminEditorRoute(templateId: string): string {
  return `${TEMPLATE_ADMIN_ROUTE}/${encodeURIComponent(templateId)}/editor`;
}

export function getTemplateIdFromAdminPath(pathname: string): string | null {
  const match = /^\/admin\/templates\/([^/]+)\/editor$/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function navigateTemplateAdmin(path: string, replace = false): void {
  if (typeof window === "undefined") return;
  if (replace) window.history.replaceState(null, "", path);
  else window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
