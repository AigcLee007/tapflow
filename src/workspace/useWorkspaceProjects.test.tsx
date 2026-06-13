import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthContext, type AuthState } from "../auth/useAuth";
import { clearWorkspaceProjectsCache } from "./workspaceSessionCache";
import { useWorkspaceProjects } from "./useWorkspaceProjects";
import type { WorkspaceProject } from "./workspaceApi";

const listWorkspaceProjectsMock = vi.fn();
const createWorkspaceProjectMock = vi.fn();
const getAssetSignedUrlsMock = vi.fn();

vi.mock("./workspaceApi", () => ({
  createWorkspaceProject: (...args: unknown[]) => createWorkspaceProjectMock(...args),
  listWorkspaceProjects: (...args: unknown[]) => listWorkspaceProjectsMock(...args),
}));

vi.mock("../assets/assetApi", () => ({
  getAssetSignedUrls: (...args: unknown[]) => getAssetSignedUrlsMock(...args),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

const baseAuthState: AuthState = {
  authenticated: true,
  error: null,
  loading: false,
  login: vi.fn(),
  logout: vi.fn(),
  permissions: ["project:read", "project:create"],
  refreshMe: vi.fn(),
  register: vi.fn(),
  roles: ["tenant_owner"],
  sessionId: "session-a",
  tenant: {
    id: "tenant-a",
    name: "Tenant A",
    plan: "free",
    slug: "tenant-a",
    status: "active",
  },
  user: {
    displayName: "User A",
    email: "user-a@example.com",
    id: "user-a",
    status: "active",
  },
};

const projectA: WorkspaceProject = {
  coverAssetId: null,
  createdAt: "2026-05-19T00:00:00.000Z",
  createdBy: "user-a",
  description: "A project",
  id: "project-a",
  name: "Project A",
  tenantId: "tenant-a",
  updatedAt: "2026-05-19T00:00:00.000Z",
};

const projectB: WorkspaceProject = {
  coverAssetId: null,
  createdAt: "2026-05-19T00:00:00.000Z",
  createdBy: "user-b",
  description: "B project",
  id: "project-b",
  name: "Project B",
  tenantId: "tenant-b",
  updatedAt: "2026-05-19T00:00:00.000Z",
};

function Harness() {
  const { loading, projects } = useWorkspaceProjects();

  return (
    <div>
      <div data-testid="loading">{loading ? "loading" : "idle"}</div>
      <div data-testid="projects">{projects.map((project) => project.name).join(",")}</div>
    </div>
  );
}

function renderWithAuth(authState: AuthState) {
  return render(
    <AuthContext.Provider value={authState}>
      <Harness />
    </AuthContext.Provider>,
  );
}

describe("useWorkspaceProjects", () => {
  beforeEach(() => {
    clearWorkspaceProjectsCache();
    listWorkspaceProjectsMock.mockReset();
    createWorkspaceProjectMock.mockReset();
    getAssetSignedUrlsMock.mockReset();
  });

  it("clears stale project state and ignores late responses from the previous identity", async () => {
    const tenantARequest = deferred<WorkspaceProject[]>();
    const tenantBRequest = deferred<WorkspaceProject[]>();

    listWorkspaceProjectsMock
      .mockReturnValueOnce(tenantARequest.promise)
      .mockReturnValueOnce(tenantBRequest.promise);

    const firstRender = renderWithAuth(baseAuthState);

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("loading");
    });

    firstRender.rerender(
      <AuthContext.Provider
        value={{
          ...baseAuthState,
          sessionId: "session-b",
          tenant: {
            ...baseAuthState.tenant!,
            id: "tenant-b",
            name: "Tenant B",
            slug: "tenant-b",
          },
          user: {
            ...baseAuthState.user!,
            displayName: "User B",
            email: "user-b@example.com",
            id: "user-b",
          },
        }}
      >
        <Harness />
      </AuthContext.Provider>,
    );

    expect(screen.getByTestId("projects").textContent).toBe("");

    tenantARequest.resolve([projectA]);
    tenantBRequest.resolve([projectB]);

    await waitFor(() => {
      expect(screen.getByTestId("projects").textContent).toContain("Project B");
    });

    expect(screen.getByTestId("projects").textContent).not.toContain("Project A");
  });

  it("shows cached projects immediately when workspace page remounts", async () => {
    listWorkspaceProjectsMock.mockResolvedValue([{ ...projectA, coverUrl: "https://cdn.test/cover.webp" }]);
    const first = renderWithAuth(baseAuthState);

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("idle"));
    first.unmount();

    renderWithAuth(baseAuthState);

    expect(screen.getByTestId("projects").textContent).toContain("Project A");
    expect(screen.getByTestId("loading").textContent).toBe("idle");
    await waitFor(() => expect(listWorkspaceProjectsMock).toHaveBeenCalledTimes(2));
  });

  it("requests backend cover urls instead of frontend signing covers", async () => {
    listWorkspaceProjectsMock.mockResolvedValue([
      { ...projectA, coverAssetId: "cover-a", coverUrl: "https://cdn.test/cover-a.webp" },
    ]);

    renderWithAuth(baseAuthState);

    await waitFor(() => {
      expect(screen.getByTestId("projects").textContent).toContain("Project A");
    });

    expect(listWorkspaceProjectsMock).toHaveBeenCalledWith({ includeCoverUrl: true });
    expect(getAssetSignedUrlsMock).not.toHaveBeenCalled();
  });
});
