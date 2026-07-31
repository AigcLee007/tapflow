import { afterEach, describe, expect, test, vi } from "vitest";

import {
  clearStoredTrustedDeviceToken,
  getStoredTrustedDeviceToken,
  login,
  setStoredTrustedDeviceToken,
  verifyEmail,
} from "./v2AuthClient";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

describe("v2 auth verification client", () => {
  afterEach(() => {
    clearStoredTrustedDeviceToken();
    window.localStorage.removeItem("v2-access-token");
    window.localStorage.removeItem("v2-refresh-token");
    vi.unstubAllGlobals();
  });

  test("includes the stored trusted device token on login", async () => {
    setStoredTrustedDeviceToken("trusted-device-token-1234567890123456");
    const fetchMock = vi.fn(async () => jsonResponse({
      status: "verification_required",
      challengeToken: "challenge-token-12345678901234567890",
      emailMasked: "a***@example.com",
      expiresInSeconds: 600,
      resendAvailableInSeconds: 60,
      reason: "new_device",
    }, 202));
    vi.stubGlobal("fetch", fetchMock);

    await login({ email: "alice@example.com", password: "StrongPass123!" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v2/auth/login",
      expect.objectContaining({
        body: expect.stringContaining("trusted-device-token-1234567890123456"),
      }),
    );
  });

  test("stores the trusted token only after successful verification", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({
        accessToken: "access-token",
        refreshToken: "refresh-token",
        trustedDeviceToken: "trusted-device-token-1234567890123456",
        currentTenant: { id: "tenant-1", name: "Tenant", plan: "free", slug: "tenant", status: "active" },
        permissions: [],
        user: { id: "user-1", email: "alice@example.com", displayName: null, status: "active" },
      }))
      .mockResolvedValueOnce(jsonResponse({
        currentTenant: { id: "tenant-1", name: "Tenant", plan: "free", slug: "tenant", status: "active" },
        permissions: [],
        roles: ["tenant_owner"],
        sessionId: "session-1",
        user: { id: "user-1", email: "alice@example.com", displayName: null, status: "active" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    await verifyEmail({
      challengeToken: "challenge-token-12345678901234567890",
      code: "123456",
    });

    expect(getStoredTrustedDeviceToken()).toBe(
      "trusted-device-token-1234567890123456",
    );
  });
});
