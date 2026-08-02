import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { V2_AUTH_CHANGE_EVENT } from "../services/v2HttpClient";
import { getAvailableCredits } from "./billingDisplay";
import {
  BILLING_SUMMARY_INVALIDATE_EVENT,
  useBillingSummarySnapshot,
} from "./useBillingSummarySnapshot";

const getBillingSummaryMock = vi.fn();
let accessToken: string | null = "access-token";

vi.mock("./billingApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./billingApi")>()),
  getBillingSummary: () => getBillingSummaryMock(),
}));

vi.mock("../services/v2HttpClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/v2HttpClient")>()),
  getStoredAccessToken: () => accessToken,
}));

const walletSummary = {
  availableCredits: 3100,
  balanceCredits: 3100,
  expiringSoonCredits: 0,
  nearestExpiryAt: null,
  reservedCredits: 0,
  walletId: "wallet-1",
};

function Probe() {
  const snapshot = useBillingSummarySnapshot(true);
  return <div data-testid="snapshot">{snapshot.status}:{snapshot.summary?.availableCredits ?? "--"}</div>;
}

describe("useBillingSummarySnapshot", () => {
  beforeEach(() => {
    accessToken = "access-token";
    getBillingSummaryMock.mockReset();
    getBillingSummaryMock.mockResolvedValue(walletSummary);
  });

  test("uses only the flat personal-wallet summary contract", () => {
    expect(getAvailableCredits(walletSummary)).toBe(3100);
    expect(getAvailableCredits(null)).toBeNull();
  });

  test("refreshes on invalidation, auth, storage, and visibility events", async () => {
    render(<Probe />);
    expect(await screen.findByText("ready:3100")).toBeTruthy();

    for (const event of [
      new Event(BILLING_SUMMARY_INVALIDATE_EVENT),
      new Event(V2_AUTH_CHANGE_EVENT),
      new StorageEvent("storage", { key: "v2-access-token" }),
    ]) {
      const previousCalls = getBillingSummaryMock.mock.calls.length;
      act(() => window.dispatchEvent(event));
      await waitFor(() => expect(getBillingSummaryMock.mock.calls.length).toBeGreaterThan(previousCalls));
    }

    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const previousCalls = getBillingSummaryMock.mock.calls.length;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(getBillingSummaryMock.mock.calls.length).toBeGreaterThan(previousCalls));
    visibility.mockRestore();
  });

  test("disables on logout and exposes an unavailable error state", async () => {
    render(<Probe />);
    expect(await screen.findByText("ready:3100")).toBeTruthy();

    accessToken = null;
    act(() => window.dispatchEvent(new Event(V2_AUTH_CHANGE_EVENT)));
    expect(await screen.findByText("disabled:--")).toBeTruthy();

    accessToken = "new-access-token";
    getBillingSummaryMock.mockRejectedValueOnce(new Error("summary unavailable"));
    act(() => window.dispatchEvent(new Event(V2_AUTH_CHANGE_EVENT)));
    expect(await screen.findByText("error:--")).toBeTruthy();
  });

  test("does not restore a stale balance after logout", async () => {
    let resolvePendingSummary!: (summary: typeof walletSummary) => void;
    getBillingSummaryMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolvePendingSummary = resolve;
    }));
    render(<Probe />);
    expect(await screen.findByText("loading:--")).toBeTruthy();

    accessToken = null;
    act(() => window.dispatchEvent(new Event(V2_AUTH_CHANGE_EVENT)));
    expect(await screen.findByText("disabled:--")).toBeTruthy();

    await act(async () => resolvePendingSummary(walletSummary));
    expect(screen.getByTestId("snapshot").textContent).toBe("disabled:--");
  });
});
