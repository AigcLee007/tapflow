export const PLATFORM_ROLES = ["platform_operator", "platform_super_admin"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

const OPERATOR_CAPABILITIES = [
  "platform:console:access",
  "platform:users:read",
  "platform:users:operate",
  "platform:usage:read",
  "platform:tasks:read",
  "platform:connections:read",
  "platform:models:read",
  "platform:routes:read",
  "platform:routes:write",
  "platform:content:manage",
  "platform:payments:read",
  "platform:redeem:operate",
  "platform:audit:read",
] as const;

export const PLATFORM_CAPABILITIES = [
  ...OPERATOR_CAPABILITIES,
  "platform:users:manage",
  "platform:connections:manage",
  "platform:pricing:publish",
  "platform:billing:adjust",
  "platform:billing:manage",
  "platform:roles:manage",
  "platform:integrations:manage",
] as const;
export type PlatformCapability = (typeof PLATFORM_CAPABILITIES)[number];

export function isPlatformRole(value: unknown): value is PlatformRole {
  return value === "platform_operator" || value === "platform_super_admin";
}

/** Platform capabilities derive only from an active, independent assignment. */
export function resolvePlatformCapabilities(role: string | null | undefined): PlatformCapability[] {
  if (role === "platform_super_admin") return [...PLATFORM_CAPABILITIES];
  if (role === "platform_operator") return [...OPERATOR_CAPABILITIES];
  return [];
}

const LEGACY_PLATFORM_PERMISSIONS = new Set([
  "admin:system", "billing:plans:manage", "billing:payments:manage", "billing:refund",
]);

/** Even custom tenant roles cannot turn the tenant membership into platform access. */
export function sanitizeTenantPermissions(permissions: readonly string[]): string[] {
  return permissions.filter((permission) =>
    !LEGACY_PLATFORM_PERMISSIONS.has(permission)
    && !permission.startsWith("platform:")
    && !permission.startsWith("provider:")
    && !permission.startsWith("credential:"),
  );
}
