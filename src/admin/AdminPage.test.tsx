import { describe, expect, it, vi } from "vitest";

import { getAdminUserDetailState, sumAvailableWalletCredits } from "./AdminPage";
import {
  BILLING_SUMMARY_INVALIDATE_EVENT,
  invalidateBillingSummary,
} from "../billing/useBillingSummarySnapshot";

describe("AdminPage module", () => {
  it("loads when the prompt library tab is registered", async () => {
    const module = await import("./AdminPage");

    expect(module.AdminPage).toEqual(expect.any(Function));
  });

  it("counts a multi-workspace user's personal wallet once", () => {
    expect(sumAvailableWalletCredits([
      {
        id: "user-1",
        wallet: { availableCredits: 310 },
        memberships: [{ tenantId: "workspace-1" }, { tenantId: "workspace-2" }],
      },
      {
        id: "user-2",
        wallet: { availableCredits: 90 },
        memberships: [{ tenantId: "workspace-3" }],
      },
    ] as never)).toBe(400);
  });

  it("invalidates shared billing summaries after a wallet mutation", () => {
    const listener = vi.fn();
    window.addEventListener(BILLING_SUMMARY_INVALIDATE_EVENT, listener);

    invalidateBillingSummary();

    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(BILLING_SUMMARY_INVALIDATE_EVENT, listener);
  });

  it("keeps a wallet visible while disabling workspace controls without memberships", () => {
    expect(getAdminUserDetailState({
      id: "user-1",
      memberships: [],
      wallet: { availableCredits: 310, balanceCredits: 450 },
    } as never)).toMatchObject({
      wallet: { availableCredits: 310, balanceCredits: 450 },
      workspaceControlsDisabled: true,
    });
  });
});
