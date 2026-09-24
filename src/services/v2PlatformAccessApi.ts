import { apiGet, apiPatch } from "./v2HttpClient";

export type PlatformRoleKey = "platform_operator" | "platform_super_admin";
export type PlatformRoleAssignment = {
  id: string; userId: string; roleKey: PlatformRoleKey; version: number; reason: string;
  grantedBy: string | null; grantedAt: string; revokedBy: string | null;
  revokedAt: string | null; revocationReason: string | null;
};

export function listPlatformRoleAssignments() {
  return apiGet<{ items: PlatformRoleAssignment[] }>("/admin/platform-roles");
}

export function changePlatformRole(userId: string, input: { roleKey: PlatformRoleKey | null; expectedVersion: number; reason: string }) {
  return apiPatch<{ assignment: PlatformRoleAssignment }>(`/admin/platform-roles/${encodeURIComponent(userId)}`, input);
}
