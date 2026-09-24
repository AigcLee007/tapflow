import { resolvePlatformCapabilities, type PlatformRole } from "../../apps/api/src/modules/platform-access/platform-access.policy";

export function platformAuth(role: PlatformRole = "platform_super_admin") {
  return { permissions: resolvePlatformCapabilities(role), roles: [role] };
}
