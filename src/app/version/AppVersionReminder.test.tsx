import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AppVersionReminder } from "./AppVersionReminder";

describe("AppVersionReminder", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    Object.defineProperty(window, "__TAPFLOW_BUILD_VERSION__", {
      configurable: true,
      value: "current-version",
      writable: true,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Reflect.deleteProperty(window, "__TAPFLOW_BUILD_VERSION__");
    vi.restoreAllMocks();
  });

  test("does not render a banner when the server version matches the current page", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ version: "current-version" }),
      ok: true,
    } as Response);

    render(<AppVersionReminder />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByText("发现新版本")).toBeNull();
  });

  test("renders a refresh banner when the server version changes", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ version: "next-version" }),
      ok: true,
    } as Response);

    render(<AppVersionReminder />);

    expect(await screen.findByText("发现新版本")).toBeTruthy();
    expect(screen.getByRole("button", { name: "立即刷新" })).toBeTruthy();
  });

  test("refresh button reloads the page", async () => {
    const reloadPage = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ version: "next-version" }),
      ok: true,
    } as Response);

    render(<AppVersionReminder onReload={reloadPage} />);

    const refreshButton = await screen.findByRole("button", { name: "立即刷新" });
    refreshButton.click();

    await waitFor(() => {
      expect(reloadPage).toHaveBeenCalled();
    });
  });
});
