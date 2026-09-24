import { hasPlatformCapability, type PlatformAccess, type PlatformCapability } from "../auth/productRoles";

export type AdminSection = "overview" | "users" | "admins" | "credits" | "announcements" | "usage" | "monitor" | "payments" | "prompt-library";
export type AdminPageDefinition = {
  path: string;
  label: string;
  group: string;
  capability: PlatformCapability;
  section?: AdminSection;
};

export const ADMIN_PAGES: AdminPageDefinition[] = [
  { path: "/admin/overview", label: "概览", group: "概览", capability: "platform:console:access", section: "overview" },
  { path: "/admin/users", label: "用户管理", group: "用户与权限", capability: "platform:users:read", section: "users" },
  { path: "/admin/access", label: "管理员与权限", group: "用户与权限", capability: "platform:roles:manage", section: "admins" },
  { path: "/admin/usage", label: "使用明细", group: "运行与用量", capability: "platform:usage:read" },
  { path: "/admin/tasks", label: "生成任务", group: "运行与用量", capability: "platform:tasks:read" },
  { path: "/admin/calls", label: "AI 调用日志", group: "运行与用量", capability: "platform:usage:read" },
  { path: "/admin/audit", label: "操作审计", group: "运行与用量", capability: "platform:audit:read" },
  { path: "/admin/models", label: "模型中心", group: "AI Gateway", capability: "platform:models:read" },
  { path: "/admin/connections", label: "渠道与连接", group: "AI Gateway", capability: "platform:connections:read" },
  { path: "/admin/inspection", label: "配置巡检", group: "AI Gateway", capability: "platform:routes:read" },
  { path: "/admin/integrations", label: "接入模板", group: "AI Gateway", capability: "platform:integrations:manage" },
  { path: "/admin/wallets", label: "积分钱包", group: "资金管理", capability: "platform:users:read", section: "users" },
  { path: "/admin/redeem-codes", label: "兑换码", group: "资金管理", capability: "platform:redeem:operate", section: "credits" },
  { path: "/admin/payments", label: "支付订单", group: "资金管理", capability: "platform:payments:read", section: "payments" },
  { path: "/admin/plans", label: "充值套餐", group: "资金管理", capability: "platform:billing:manage" },
  { path: "/admin/announcements", label: "公告", group: "内容运营", capability: "platform:content:manage", section: "announcements" },
  { path: "/admin/prompts", label: "提示词", group: "内容运营", capability: "platform:content:manage", section: "prompt-library" },
  { path: "/admin/templates", label: "工作流模板", group: "内容运营", capability: "platform:content:manage" },
  { path: "/admin/system/health", label: "线路监控", group: "系统管理", capability: "platform:routes:read", section: "monitor" },
];

const LEGACY_HASH_PATHS: Record<string, string> = {
  overview: "/admin/overview", users: "/admin/users", admins: "/admin/access", credits: "/admin/wallets",
  announcements: "/admin/announcements", usage: "/admin/usage", models: "/admin/models",
  providers: "/admin/connections", monitor: "/admin/system/health", payments: "/admin/payments", "prompt-library": "/admin/prompts",
};
const LEGACY_ACCOUNT_PATHS: Record<string, string> = {
  "/account/ai-settings": "/admin/models", "/account/provider-settings": "/admin/connections",
  "/account/template-library": "/admin/integrations", "/account/inspection": "/admin/inspection",
};

export function getAdminRedirect(location: { pathname: string; search: string; hash: string }): string | null {
  const target = location.pathname === "/admin"
    ? LEGACY_HASH_PATHS[location.hash.slice(1)] ?? "/admin/overview"
    : LEGACY_ACCOUNT_PATHS[location.pathname];
  return target ? `${target}${location.search}` : null;
}

export function getAdminPage(pathname: string): AdminPageDefinition | null {
  return ADMIN_PAGES.find((page) => page.path === pathname
    || (["/admin/users", "/admin/usage", "/admin/tasks", "/admin/calls"].includes(page.path) && pathname.startsWith(`${page.path}/`) && pathname.slice(page.path.length+1).split("/").length === 1)
    || (page.path === "/admin/templates" && /^\/admin\/templates\/[^/]+(?:\/editor)?$/.test(pathname))) ?? null;
}

export function getVisibleAdminPages(access: PlatformAccess): AdminPageDefinition[] {
  if (!hasPlatformCapability(access, "platform:console:access")) return [];
  return ADMIN_PAGES.filter((page) => hasPlatformCapability(access, page.capability));
}
