import {
  apiGet,
  apiPost,
  clearStoredAuth,
  getStoredRefreshToken,
  refreshAccessToken,
  setStoredTokens,
} from "./v2HttpClient";

export type LegalConsentInput = {
  privacyVersion: string;
  termsVersion: string;
};

export type V2User = {
  displayName: string | null;
  email: string;
  id: string;
  status: string;
};

export type V2Tenant = {
  id: string;
  name: string;
  plan: string;
  slug: string;
  status: string;
};

export type AuthSession = {
  currentTenant: V2Tenant | null;
  permissions: string[];
  roles: string[];
  sessionId: string | null;
  user: V2User;
};

export type AuthTokensResponse = {
  accessToken: string;
  currentTenant: V2Tenant;
  permissions?: string[];
  refreshToken: string;
  user: V2User;
  trustedDeviceToken?: string;
};

export type VerificationRequired = {
  status: "verification_required";
  challengeToken: string;
  emailMasked: string;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
  reason: "email_unverified" | "new_device" | "trust_expired" | "anomalous_login";
};

export type AuthenticatedResult = { status: "authenticated"; session: AuthSession };
export type AuthAttemptResult = AuthenticatedResult | VerificationRequired;

export type PasswordResetChallenge = { challengeToken: string; expiresInSeconds: number; resendAvailableInSeconds: number; message: string };

export function requestPasswordReset(input: { email: string }) {
  return apiPost<PasswordResetChallenge>("/auth/password-reset/request", input, { auth: false, retryOnUnauthorized: false });
}

export function resendPasswordReset(input: { challengeToken: string }) {
  return apiPost<PasswordResetChallenge>("/auth/password-reset/resend", input, { auth: false, retryOnUnauthorized: false });
}

export function confirmPasswordReset(input: { challengeToken: string; code: string; newPassword: string }) {
  return apiPost<{ message: string }>("/auth/password-reset/confirm", input, { auth: false, retryOnUnauthorized: false });
}

const TRUSTED_DEVICE_TOKEN_KEY = "v2-trusted-device-token";

export function getStoredTrustedDeviceToken(): string | null {
  return typeof window === "undefined"
    ? null
    : window.localStorage.getItem(TRUSTED_DEVICE_TOKEN_KEY);
}

export function setStoredTrustedDeviceToken(token: string): void {
  if (typeof window !== "undefined") window.localStorage.setItem(TRUSTED_DEVICE_TOKEN_KEY, token);
}

export function clearStoredTrustedDeviceToken(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(TRUSTED_DEVICE_TOKEN_KEY);
}

export async function register(input: {
  consent: LegalConsentInput;
  displayName?: string;
  email: string;
  password: string;
  tenantName?: string;
}): Promise<AuthAttemptResult> {
  clearStoredAuth();
  const response = await apiPost<AuthTokensResponse | VerificationRequired>("/auth/register", input, {
    auth: false,
    retryOnUnauthorized: false,
  });
  if ("status" in response && response.status === "verification_required") return response;
  setStoredTokens(response);
  return { status: "authenticated", session: {
    currentTenant: response.currentTenant,
    permissions: response.permissions ?? [],
    roles: [],
    sessionId: null,
    user: response.user,
  } };
}

export async function login(input: {
  consent: LegalConsentInput;
  email: string;
  password: string;
  tenantId?: string;
}): Promise<AuthAttemptResult> {
  clearStoredAuth();
  const response = await apiPost<AuthTokensResponse | VerificationRequired>("/auth/login", {
    ...input,
    trustedDeviceToken: getStoredTrustedDeviceToken() ?? undefined,
  }, {
    auth: false,
    retryOnUnauthorized: false,
  });
  if ("status" in response && response.status === "verification_required") return response;
  setStoredTokens(response);

  const session = await getMe().catch(() => ({
    currentTenant: response.currentTenant,
    permissions: response.permissions ?? [],
    roles: [],
    sessionId: null,
    user: response.user,
  }));
  return { status: "authenticated", session };
}

export async function verifyEmail(input: {
  challengeToken: string;
  code: string;
}): Promise<AuthSession> {
  const response = await apiPost<AuthTokensResponse & { trustedDeviceToken: string }>(
    "/auth/email/verify",
    input,
    { auth: false, retryOnUnauthorized: false },
  );
  setStoredTokens(response);
  setStoredTrustedDeviceToken(response.trustedDeviceToken);
  return getMe();
}

export async function resendEmailVerification(input: {
  challengeToken: string;
}): Promise<VerificationRequired> {
  return apiPost<VerificationRequired>("/auth/email/resend", input, {
    auth: false,
    retryOnUnauthorized: false,
  });
}

export async function refresh() {
  return refreshAccessToken();
}

export async function logout(): Promise<{ ok: true }> {
  const refreshToken = getStoredRefreshToken();
  try {
    if (refreshToken) {
      await apiPost<{ ok: true }>(
        "/auth/logout",
        { refreshToken },
        {
          auth: true,
          retryOnUnauthorized: false,
        },
      );
    }
  } finally {
    clearStoredAuth();
  }

  return { ok: true };
}

export async function getMe(): Promise<AuthSession> {
  const response = await apiGet<{
    currentTenant: V2Tenant | null;
    permissions?: string[];
    roles?: string[];
    sessionId?: string;
    user: V2User;
  }>("/auth/me");

  return {
    currentTenant: response.currentTenant,
    permissions: response.permissions ?? [],
    roles: response.roles ?? [],
    sessionId: response.sessionId ?? null,
    user: response.user,
  };
}
