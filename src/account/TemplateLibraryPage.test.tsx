import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AuthContext, type AuthState } from "../auth/useAuth";
import { TemplateLibraryPage } from "./TemplateLibraryPage";

const listAiPluginsMock = vi.fn();
const installAiPluginMock = vi.fn();
const publishAiPluginInstallMock = vi.fn();
const disableAiPluginInstallMock = vi.fn();

vi.mock("../services/v2AiPluginAdminApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/v2AiPluginAdminApi")>();
  return {
    ...actual,
    disableAiPluginInstall: (...args: Parameters<typeof actual.disableAiPluginInstall>) =>
      disableAiPluginInstallMock(...args),
    installAiPlugin: (...args: Parameters<typeof actual.installAiPlugin>) =>
      installAiPluginMock(...args),
    listAiPlugins: (...args: Parameters<typeof actual.listAiPlugins>) =>
      listAiPluginsMock(...args),
    publishAiPluginInstall: (...args: Parameters<typeof actual.publishAiPluginInstall>) =>
      publishAiPluginInstallMock(...args),
  };
});

function createAuthState(): AuthState {
  return {
    authenticated: true,
    error: null,
    loading: false,
    login: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    permissions: ["admin:system"],
    refreshMe: vi.fn(async () => undefined),
    register: vi.fn(async () => undefined),
    roles: ["tenant_owner"],
    sessionId: "session-1",
    tenant: { id: "tenant-1", name: "Test Tenant", plan: "pro", slug: "test", status: "active" },
    user: { displayName: "Tester", email: "tester@example.com", id: "user-1", status: "active" },
  };
}

describe("TemplateLibraryPage", () => {
  beforeEach(() => {
    listAiPluginsMock.mockReset();
    installAiPluginMock.mockReset();
    publishAiPluginInstallMock.mockReset();
    disableAiPluginInstallMock.mockReset();

    listAiPluginsMock.mockImplementation(async (modality: string) => {
      if (modality === "video") {
        return [
          {
            credentials: {
              fields: [],
              required: false,
              type: "bearer",
            },
            description: "Server-side FFmpeg export route for video editor timelines.",
            displayName: "Video Editor FFmpeg Export",
            install: null,
            modality: "video",
            models: [
              {
                defaultRouteKey: "video.editor.ffmpeg",
                displayName: "Video Editor FFmpeg",
                modelFamily: "tapflow.video-editor",
                modelKey: "video-editor-ffmpeg",
              },
            ],
            packageKey: "tapflow.video-editor-ffmpeg",
            provider: {
              key: "tapflow-local-render",
              kind: "mock",
              name: "TapFlow Local Renderer",
            },
            version: "1.0.0",
          },
          {
            credentialBindings: [
              { bindingKey: "gemini-omni-flash", label: "Gemini Omni Flash", modelKey: "gemini-omni-flash", routeKey: "video.pixelhub.gemini-omni-flash" },
              { bindingKey: "sora-v3-pro", label: "Sora V3 Pro", modelKey: "sora-v3-pro", routeKey: "video.pixelhub.sora-v3-pro" },
              { bindingKey: "veo31-fast", label: "Veo 3.1 Fast", modelKey: "veo31-fast", routeKey: "video.pixelhub.veo31-fast" },
            ],
            credentials: { fields: [], required: true, type: "bearer" },
            description: "PixelHub video generation.",
            displayName: "PixelHub Video",
            install: null,
            modality: "video",
            models: [],
            packageKey: "pixelhub.video",
            provider: { key: "pixelhub", kind: "pixelhub-video", name: "PixelHub" },
            version: "1.0.0",
          },
        ];
      }

      return [
        {
          credentials: {
            fields: [
              {
                key: "apiKey",
                label: "Nano Banana Pro API Key",
                placeholder: "sk-...",
                required: true,
                secret: true,
              },
            ],
            required: true,
            type: "bearer",
          },
          description: "Image plugin",
          displayName: "Nano Banana Pro",
          install: null,
          modality: "image",
          models: [
            {
              defaultRouteKey: "image.pixellelabs.nano-banana-pro",
              displayName: "Nano Banana Pro",
              modelFamily: "pixellelabs.nano-banana-pro",
              modelKey: "gemini-3-pro-image-preview",
            },
          ],
          packageKey: "pixellelabs.nano-banana-pro",
          provider: {
            key: "pixellelabs",
            kind: "pixellelabs-gemini-image",
            name: "PixelleLabs",
          },
          version: "1.0.0",
        },
      ];
    });

    installAiPluginMock.mockResolvedValue({
      catalogModelKeys: ["video-editor-ffmpeg"],
      credentialId: null,
      disabledAt: null,
      id: "install-1",
      installedVersion: "1.0.0",
      metadata: {},
      packageId: "package-1",
      packageKey: "tapflow.video-editor-ffmpeg",
      providerId: "provider-1",
      publishedAt: "2026-07-06T00:00:00.000Z",
      routeKeys: ["video.editor.ffmpeg"],
      status: "published",
    });
  });

  test("installs credential-free video plugins without rendering API key fields", async () => {
    render(
      <AuthContext.Provider value={createAuthState()}>
        <TemplateLibraryPage />
      </AuthContext.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "template modality video" }));

    expect(await screen.findByRole("button", { name: "template plugin tapflow.video-editor-ffmpeg" })).toBeTruthy();
    expect(screen.queryByLabelText("template credential name")).toBeNull();
    expect(screen.queryByLabelText("template credential secret")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "install selected template" }));

    await waitFor(() => {
      expect(installAiPluginMock).toHaveBeenCalledWith("tapflow.video-editor-ffmpeg", {
        baseUrlOverride: undefined,
        publishImmediately: true,
      });
    });
    expect(installAiPluginMock.mock.calls[0]?.[1]).not.toHaveProperty("credential");
  });

  test("submits one secret per PixelHub route binding", async () => {
    render(
      <AuthContext.Provider value={createAuthState()}>
        <TemplateLibraryPage />
      </AuthContext.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "template modality video" }));
    fireEvent.click(await screen.findByRole("button", { name: "template plugin pixelhub.video" }));
    fireEvent.change(screen.getByLabelText("template credential secret gemini-omni-flash"), { target: { value: "gemini-secret" } });
    fireEvent.change(screen.getByLabelText("template credential secret sora-v3-pro"), { target: { value: "sora-secret" } });
    fireEvent.change(screen.getByLabelText("template credential secret veo31-fast"), { target: { value: "veo-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "install selected template" }));

    await waitFor(() => expect(installAiPluginMock).toHaveBeenCalledWith("pixelhub.video", {
      baseUrlOverride: undefined,
      credentials: {
        "gemini-omni-flash": { name: "PixelHub Gemini Omni Flash Key", secret: "gemini-secret" },
        "sora-v3-pro": { name: "PixelHub Sora V3 Pro Key", secret: "sora-secret" },
        "veo31-fast": { name: "PixelHub Veo 3.1 Fast Key", secret: "veo-secret" },
      },
      publishImmediately: true,
    }));
  });

  test("keeps PixelHub install disabled until every route secret is filled", async () => {
    render(
      <AuthContext.Provider value={createAuthState()}>
        <TemplateLibraryPage />
      </AuthContext.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "template modality video" }));
    fireEvent.click(await screen.findByRole("button", { name: "template plugin pixelhub.video" }));
    const installButton = screen.getByRole("button", { name: "install selected template" });

    expect((installButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("template credential secret gemini-omni-flash"), { target: { value: "gemini-secret" } });
    fireEvent.change(screen.getByLabelText("template credential secret sora-v3-pro"), { target: { value: "sora-secret" } });
    expect((installButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("template credential secret veo31-fast"), { target: { value: "veo-secret" } });
    expect((installButton as HTMLButtonElement).disabled).toBe(false);
  });
});
