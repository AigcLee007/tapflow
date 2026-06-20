export type ProductRole = "admin" | "creator" | "super_admin";

export function resolveProductRole(input: {
  permissions?: string[];
  roles?: string[];
}): ProductRole {
  const roles = input.roles ?? [];
  const permissions = input.permissions ?? [];
  if (roles.includes("system_admin") || roles.includes("admin_email")) {
    return "super_admin";
  }
  if (permissions.includes("admin:system")) {
    return "admin";
  }
  return "creator";
}

export function canAccessOperationsConsole(role: ProductRole): boolean {
  return role === "admin" || role === "super_admin";
}

export function canAccessProviderOperations(role: ProductRole): boolean {
  return role === "super_admin";
}
