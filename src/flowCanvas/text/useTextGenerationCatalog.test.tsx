import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AuthContext, type AuthState } from "../../auth/useAuth";
import {
  __resetTextGenerationCatalogCacheForTests,
  useTextGenerationCatalog,
} from "./useTextGenerationCatalog";

const listAiModelCatalogMock = vi.fn();
const listAiModelRoutesMock = vi.fn();

vi.mock("../../services/v2AiModelCatalogApi", () => ({
  listAiModelCatalog: (...args: unknown[]) => listAiModelCatalogMock(...args),
  listAiModelRoutes: (...args: unknown[]) => listAiModelRoutesMock(...args),
}));

const catalogModel = {
  capabilities: {},
  defaultRouteKey: "text.real",
  displayName: "真实文本模型",
  id: "catalog-text-1",
  modality: "text" as const,
  modelFamily: "real-text-family",
  modelId: "model-uuid-1",
  modelKey: "real-text-model",
  sortOrder: 10,
  status: "active",
  uiSchema: {},
};

const catalogRoute = {
  capabilities: {},
  estimatedCredits: 2,
  minChargeCredits: 2,
  modality: "text",
  modelFamily: "real-text-family",
  modelKey: "real-text-model",
  pricingUnit: "text_generation",
  providerKey: "real-provider",
  providerName: "Real Provider",
  routeId: "route-uuid-1",
  routeKey: "text.real",
  routeLabel: "线路一",
};

function createAuthState(): AuthState {
  return {
    authenticated: true,
    error: null,
    loading: false,
    permissions: [],
    refreshMe: vi.fn(async () => undefined),
    register: vi.fn(async () => undefined),
    login: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    roles: [],
    sessionId: "session-a",
    tenant: { id: "tenant-a", name: "Tenant", plan: "free", slug: "tenant", status: "active" },
    user: { displayName: "User", email: "user@example.com", id: "user-a", status: "active" },
  };
}

function authWrapper({ children }: { children: ReactNode }) {
  return <AuthContext.Provider value={createAuthState()}>{children}</AuthContext.Provider>;
}

describe("useTextGenerationCatalog", () => {
  afterEach(() => {
    __resetTextGenerationCatalogCacheForTests();
    listAiModelCatalogMock.mockReset();
    listAiModelRoutesMock.mockReset();
  });

  test("shares one authenticated catalog request and exposes real text models and routes", async () => {
    listAiModelCatalogMock.mockResolvedValue([catalogModel]);
    listAiModelRoutesMock.mockResolvedValue([catalogRoute]);

    const first = renderHook(() => useTextGenerationCatalog(), { wrapper: authWrapper });
    const second = renderHook(() => useTextGenerationCatalog(), { wrapper: authWrapper });

    await waitFor(() => expect(first.result.current.loading).toBe(false));

    expect(second.result.current.models[0]).toMatchObject({
      modelKey: "real-text-model",
      routes: [expect.objectContaining({ id: "route-uuid-1", routeKey: "text.real" })],
    });
    expect(listAiModelCatalogMock).toHaveBeenCalledTimes(1);
    expect(listAiModelCatalogMock).toHaveBeenCalledWith("text");
    expect(listAiModelRoutesMock).toHaveBeenCalledWith("real-text-model");
  });

  test("does not inject placeholders for an empty catalog", async () => {
    listAiModelCatalogMock.mockResolvedValue([]);

    const hook = renderHook(() => useTextGenerationCatalog(), { wrapper: authWrapper });

    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.models).toEqual([]);
    expect(listAiModelRoutesMock).not.toHaveBeenCalled();
  });

  test("exposes an error without fallback models and retries", async () => {
    listAiModelCatalogMock.mockRejectedValueOnce(new Error("catalog unavailable"));
    const hook = renderHook(() => useTextGenerationCatalog(), { wrapper: authWrapper });

    await waitFor(() => expect(hook.result.current.error).toBe("catalog unavailable"));
    expect(hook.result.current.models).toEqual([]);

    listAiModelCatalogMock.mockResolvedValueOnce([catalogModel]);
    listAiModelRoutesMock.mockResolvedValueOnce([catalogRoute]);
    act(() => hook.result.current.retry());

    await waitFor(() => expect(hook.result.current.models).toHaveLength(1));
    expect(hook.result.current.error).toBeNull();
  });
});
