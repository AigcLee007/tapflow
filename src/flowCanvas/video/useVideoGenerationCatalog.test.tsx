import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AuthContext, type AuthState } from "../../auth/useAuth";
import {
  __resetVideoGenerationCatalogCacheForTests,
  useVideoGenerationCatalog,
} from "./useVideoGenerationCatalog";

const listAiModelCatalogMock = vi.fn();
const listAiModelRoutesMock = vi.fn();

vi.mock("../../services/v2AiModelCatalogApi", () => ({
  listAiModelCatalog: (...args: unknown[]) => listAiModelCatalogMock(...args),
  listAiModelRoutes: (...args: unknown[]) => listAiModelRoutesMock(...args),
}));

const model = {
  capabilities: {},
  defaultRouteKey: "private-default-route",
  displayName: "Catalog video",
  id: "catalog-video-1",
  modality: "video" as const,
  modelFamily: "private-family",
  modelId: "private-model",
  modelKey: "video.catalog-video",
  sortOrder: 10,
  status: "active",
  uiSchema: {},
};

const generationRoute = {
  capabilities: { supportedVideoWorkflows: ["video_generation"] },
  estimatedCredits: 5,
  minChargeCredits: 5,
  modality: "video",
  modelFamily: "private-family",
  modelKey: "video.catalog-video",
  pricingUnit: "video_generation",
  providerKey: "private-provider",
  providerName: "Private provider",
  routeId: "route-id",
  routeKey: "private-route",
  routeLabel: "Private route",
};

function createAuthState(input?: {
  sessionId?: string;
  tenantId?: string;
  userId?: string;
}): AuthState {
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
    sessionId: input?.sessionId ?? "session-a",
    tenant: {
      id: input?.tenantId ?? "tenant-a",
      name: "Tenant",
      plan: "free",
      slug: "tenant",
      status: "active",
    },
    user: {
      displayName: "User",
      email: "user@example.com",
      id: input?.userId ?? "user-a",
      status: "active",
    },
  };
}

function authWrapper({ children }: { children: ReactNode }) {
  return <AuthContext.Provider value={createAuthState()}>{children}</AuthContext.Provider>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe("useVideoGenerationCatalog", () => {
  afterEach(() => {
    __resetVideoGenerationCatalogCacheForTests();
    listAiModelCatalogMock.mockReset();
    listAiModelRoutesMock.mockReset();
  });

  test("shares one video catalog request and exposes mapped models", async () => {
    listAiModelCatalogMock.mockResolvedValue([model]);
    listAiModelRoutesMock.mockResolvedValue([generationRoute]);

    const first = renderHook(() => useVideoGenerationCatalog(), { wrapper: authWrapper });
    const second = renderHook(() => useVideoGenerationCatalog(), { wrapper: authWrapper });

    await waitFor(() => expect(first.result.current.loading).toBe(false));

    expect(second.result.current.models.map((item) => item.label)).toEqual(["视频模型 1"]);
    expect(listAiModelCatalogMock).toHaveBeenCalledTimes(1);
    expect(listAiModelCatalogMock).toHaveBeenCalledWith("video");
    expect(listAiModelRoutesMock).toHaveBeenCalledTimes(1);
  });

  test("does not inject mock entries after a failed request and can retry", async () => {
    listAiModelCatalogMock.mockRejectedValueOnce(new Error("catalog unavailable"));
    const hook = renderHook(() => useVideoGenerationCatalog(), { wrapper: authWrapper });

    await waitFor(() => expect(hook.result.current.error).toBe("catalog unavailable"));
    expect(hook.result.current.models).toEqual([]);

    listAiModelCatalogMock.mockResolvedValueOnce([model]);
    listAiModelRoutesMock.mockResolvedValueOnce([generationRoute]);
    act(() => hook.result.current.retry());

    await waitFor(() => expect(hook.result.current.models.map((item) => item.id)).toEqual(["catalog-video-1"]));
    expect(hook.result.current.error).toBeNull();
  });

  test("keeps the retried catalog generation authoritative when an older request resolves later", async () => {
    const firstCatalog = deferred<typeof model[]>();
    const secondCatalog = deferred<typeof model[]>();
    const staleModel = { ...model, displayName: "Stale catalog video", id: "stale-video", modelKey: "video.stale" };
    const freshModel = { ...model, displayName: "Fresh catalog video", id: "fresh-video", modelKey: "video.fresh" };
    listAiModelCatalogMock
      .mockImplementationOnce(() => firstCatalog.promise)
      .mockImplementationOnce(() => secondCatalog.promise);
    listAiModelRoutesMock.mockResolvedValue([generationRoute]);

    const retried = renderHook(() => useVideoGenerationCatalog(), { wrapper: authWrapper });
    await waitFor(() => expect(listAiModelCatalogMock).toHaveBeenCalledTimes(1));

    act(() => retried.result.current.retry());
    await waitFor(() => expect(listAiModelCatalogMock).toHaveBeenCalledTimes(2));

    await act(async () => {
      firstCatalog.resolve([staleModel]);
      await Promise.resolve();
    });
    await waitFor(() => expect(listAiModelRoutesMock).toHaveBeenCalledWith("video.stale"));

    const concurrent = renderHook(() => useVideoGenerationCatalog(), { wrapper: authWrapper });
    expect(concurrent.result.current.models).toEqual([]);
    expect(concurrent.result.current.loading).toBe(true);
    expect(listAiModelCatalogMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      secondCatalog.resolve([freshModel]);
      await Promise.resolve();
    });
    await waitFor(() => expect(retried.result.current.models.map((item) => item.id)).toEqual(["fresh-video"]));
    await waitFor(() => expect(concurrent.result.current.models.map((item) => item.id)).toEqual(["fresh-video"]));
  });

  test("invalidates every mounted consumer when a retry supersedes a shared request", async () => {
    const firstCatalog = deferred<typeof model[]>();
    const secondCatalog = deferred<typeof model[]>();
    const staleModel = { ...model, displayName: "Stale catalog video", id: "stale-video", modelKey: "video.stale" };
    const freshModel = { ...model, displayName: "Fresh catalog video", id: "fresh-video", modelKey: "video.fresh" };
    listAiModelCatalogMock
      .mockImplementationOnce(() => firstCatalog.promise)
      .mockImplementationOnce(() => secondCatalog.promise);
    listAiModelRoutesMock.mockResolvedValue([generationRoute]);

    const first = renderHook(() => useVideoGenerationCatalog(), { wrapper: authWrapper });
    const second = renderHook(() => useVideoGenerationCatalog(), { wrapper: authWrapper });
    await waitFor(() => expect(listAiModelCatalogMock).toHaveBeenCalledTimes(1));

    act(() => first.result.current.retry());
    await waitFor(() => expect(listAiModelCatalogMock).toHaveBeenCalledTimes(2));

    await act(async () => {
      firstCatalog.resolve([staleModel]);
      await Promise.resolve();
    });

    expect(first.result.current.models).toEqual([]);
    expect(second.result.current.models).toEqual([]);
    expect(first.result.current.loading).toBe(true);
    expect(second.result.current.loading).toBe(true);

    await act(async () => {
      secondCatalog.resolve([freshModel]);
      await Promise.resolve();
    });

    await waitFor(() => expect(first.result.current.models.map((item) => item.id)).toEqual(["fresh-video"]));
    await waitFor(() => expect(second.result.current.models.map((item) => item.id)).toEqual(["fresh-video"]));
    expect(first.result.current.loading).toBe(false);
    expect(second.result.current.loading).toBe(false);
  });

  test("clears stale catalog values for every mounted consumer before retry resolves", async () => {
    const refreshedCatalog = deferred<typeof model[]>();
    const initialModel = { ...model, displayName: "Initial catalog video", id: "initial-video", modelKey: "video.initial" };
    const freshModel = { ...model, displayName: "Fresh catalog video", id: "fresh-video", modelKey: "video.fresh" };
    listAiModelCatalogMock
      .mockResolvedValueOnce([initialModel])
      .mockImplementationOnce(() => refreshedCatalog.promise);
    listAiModelRoutesMock.mockResolvedValue([generationRoute]);

    const first = renderHook(() => useVideoGenerationCatalog(), { wrapper: authWrapper });
    const second = renderHook(() => useVideoGenerationCatalog(), { wrapper: authWrapper });
    await waitFor(() => expect(first.result.current.models.map((item) => item.id)).toEqual(["initial-video"]));
    await waitFor(() => expect(second.result.current.models.map((item) => item.id)).toEqual(["initial-video"]));

    act(() => first.result.current.retry());

    expect(first.result.current.models).toEqual([]);
    expect(second.result.current.models).toEqual([]);
    expect(first.result.current.error).toBeNull();
    expect(second.result.current.error).toBeNull();
    expect(first.result.current.loading).toBe(true);
    expect(second.result.current.loading).toBe(true);

    await act(async () => {
      refreshedCatalog.resolve([freshModel]);
      await Promise.resolve();
    });

    await waitFor(() => expect(first.result.current.models.map((item) => item.id)).toEqual(["fresh-video"]));
    await waitFor(() => expect(second.result.current.models.map((item) => item.id)).toEqual(["fresh-video"]));
  });

  test("fetches a fresh catalog after the authenticated tenant session changes", async () => {
    const tenantAModel = { ...model, displayName: "Tenant A video", id: "tenant-a-video", modelKey: "video.tenant-a" };
    const tenantBModel = { ...model, displayName: "Tenant B video", id: "tenant-b-video", modelKey: "video.tenant-b" };
    listAiModelCatalogMock
      .mockResolvedValueOnce([tenantAModel])
      .mockResolvedValueOnce([tenantBModel]);
    listAiModelRoutesMock.mockResolvedValue([generationRoute]);

    let auth = createAuthState({ sessionId: "session-a", tenantId: "tenant-a", userId: "user-a" });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
    );
    const hook = renderHook(() => useVideoGenerationCatalog(), { wrapper });

    await waitFor(() => expect(hook.result.current.models.map((item) => item.id)).toEqual(["tenant-a-video"]));

    auth = createAuthState({ sessionId: "session-b", tenantId: "tenant-b", userId: "user-b" });
    hook.rerender();

    await waitFor(() => expect(hook.result.current.models.map((item) => item.id)).toEqual(["tenant-b-video"]));
    expect(listAiModelCatalogMock).toHaveBeenCalledTimes(2);
    expect(listAiModelRoutesMock).toHaveBeenCalledWith("video.tenant-b");
  });

  test("does not expose an already-loaded tenant catalog during the first render for a new session", async () => {
    const tenantAModel = { ...model, displayName: "Tenant A video", id: "tenant-a-video", modelKey: "video.tenant-a" };
    const tenantBCatalog = deferred<typeof model[]>();
    const tenantBModel = { ...model, displayName: "Tenant B video", id: "tenant-b-video", modelKey: "video.tenant-b" };
    listAiModelCatalogMock
      .mockResolvedValueOnce([tenantAModel])
      .mockImplementationOnce(() => tenantBCatalog.promise);
    listAiModelRoutesMock.mockResolvedValue([generationRoute]);

    let auth = createAuthState({ sessionId: "session-a", tenantId: "tenant-a", userId: "user-a" });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
    );
    const renderSnapshots: Array<{ loading: boolean; modelIds: string[]; sessionId: string | null }> = [];
    const hook = renderHook(() => {
      const catalog = useVideoGenerationCatalog();
      renderSnapshots.push({
        loading: catalog.loading,
        modelIds: catalog.models.map((item) => item.id),
        sessionId: auth.sessionId,
      });
      return catalog;
    }, { wrapper });

    await waitFor(() => expect(hook.result.current.models.map((item) => item.id)).toEqual(["tenant-a-video"]));

    auth = createAuthState({ sessionId: "session-b", tenantId: "tenant-b", userId: "user-b" });
    hook.rerender();

    expect(renderSnapshots.find((snapshot) => snapshot.sessionId === "session-b")).toEqual({
      loading: true,
      modelIds: [],
      sessionId: "session-b",
    });
    expect(hook.result.current.models).toEqual([]);
    expect(hook.result.current.loading).toBe(true);
    expect(hook.result.current.error).toBeNull();

    await act(async () => {
      tenantBCatalog.resolve([tenantBModel]);
      await Promise.resolve();
    });

    await waitFor(() => expect(hook.result.current.models.map((item) => item.id)).toEqual(["tenant-b-video"]));
  });
});
