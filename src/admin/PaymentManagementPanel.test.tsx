import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { PaymentManagementPanel } from "./PaymentManagementPanel";

const listPlans = vi.fn();
const listPayments = vi.fn();
const refundPayment = vi.fn();
const updatePlan = vi.fn();

vi.mock("./adminApi", () => ({
  listAdminRechargePlans: () => listPlans(),
  listAdminWalletPayments: () => listPayments(),
  queryAdminWalletPayment: vi.fn(),
  refundAdminWalletPayment: (id: string, reason: string) => refundPayment(id, reason),
  updateAdminRechargePlan: (id: string, input: unknown) => updatePlan(id, input),
}));

const plan = {
  active: true, amountCents: 990, createdAt: "2026-07-27T00:00:00.000Z", credits: 100,
  currency: "CNY", id: "plan-1", key: "credits_100", name: "100 AI credits", sortOrder: 10,
  updatedAt: "2026-07-27T00:00:00.000Z", validityDays: 365,
};

const payment = {
  amountCents: 990, createdAt: "2026-07-27T00:00:00.000Z", credits: 100,
  eligible: false, expiresAtSnapshot: null, id: "payment-1", merchantOrderId: "TF0001",
  paidAt: "2026-07-27T00:00:00.000Z", planKey: "credits_100", status: "paid", userEmail: "user@example.com",
};

describe("PaymentManagementPanel", () => {
  beforeEach(() => {
    listPlans.mockResolvedValue([plan]);
    listPayments.mockResolvedValue([payment]);
    refundPayment.mockResolvedValue({ ...payment, status: "refund_pending" });
    updatePlan.mockResolvedValue(plan);
  });

  test("saves administrator-controlled display order", async () => {
    render(<PaymentManagementPanel />);
    const sortOrder = await screen.findByLabelText("Sort order for 100 AI credits");
    fireEvent.change(sortOrder, { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Save 100 AI credits" }));

    await waitFor(() => expect(updatePlan).toHaveBeenCalledWith("plan-1", expect.objectContaining({ sortOrder: 25 })));
  });

  test("allows refund only for an API-eligible paid payment", async () => {
    render(<PaymentManagementPanel />);
    const reason = await screen.findByLabelText("Refund reason");
    fireEvent.change(reason, { target: { value: "Duplicate charge" } });
    expect(screen.getByRole("button", { name: "Refund payment-1" }).hasAttribute("disabled")).toBe(true);
  });
});
