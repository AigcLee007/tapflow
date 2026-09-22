export type ProductRole = "admin" | "creator" | "super_admin";
export type PlatformAccess = { permissions?: readonly string[]; roles?: readonly string[] };
export type PlatformCapability =
  | "platform:console:access" | "platform:users:read" | "platform:users:operate" | "platform:users:manage"
  | "platform:usage:read" | "platform:tasks:read" | "platform:connections:read" | "platform:connections:manage"
  | "platform:models:read" | "platform:routes:read" | "platform:routes:write" | "platform:pricing:publish"
  | "platform:content:manage" | "platform:payments:read" | "platform:redeem:operate" | "platform:audit:read"
  | "platform:billing:adjust" | "platform:billing:manage" | "platform:roles:manage" | "platform:integrations:manage";

export function resolveProductRole(input: PlatformAccess): ProductRole {
  const roles = input.roles ?? [];
  if (roles.includes("platform_super_admin")) {
    return "super_admin";
  }
  if (roles.includes("platform_operator")) {
    return "admin";
  }
  return "creator";
}

export function hasPlatformCapability(input: PlatformAccess, capability: PlatformCapability): boolean {
  return canAccessOperationsConsole(resolveProductRole(input)) && Boolean(input.permissions?.includes(capability));
}

export function canAccessOperationsConsole(role: ProductRole): boolean {
  return role === "admin" || role === "super_admin";
}

export function canAccessProviderOperations(role: ProductRole): boolean {
  return role === "super_admin";
}
