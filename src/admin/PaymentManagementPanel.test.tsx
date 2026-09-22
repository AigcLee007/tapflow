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
    vi.clearAllMocks();
    listPlans.mockResolvedValue([plan]);
    listPayments.mockResolvedValue([payment]);
    refundPayment.mockResolvedValue({ ...payment, status: "refund_pending" });
    updatePlan.mockResolvedValue(plan);
  });

  test("lets operators read orders without loading plans or exposing financial writes", async () => {
    render(<PaymentManagementPanel canManage={false} />);
    expect(await screen.findByText(/user@example.com/)).toBeTruthy();
    expect(listPlans).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("退款原因")).toBeNull();
    expect(screen.queryByRole("button", { name: "退款 payment-1" })).toBeNull();
    expect(screen.queryByRole("button", { name: "查询 payment-1" })).toBeNull();
  });

  test("saves administrator-controlled display order", async () => {
    render(<PaymentManagementPanel canManage />);
    const sortOrder = await screen.findByLabelText("充值套餐排序：100 AI credits");
    fireEvent.change(sortOrder, { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "保存 100 AI credits" }));

    await waitFor(() => expect(updatePlan).toHaveBeenCalledWith("plan-1", expect.objectContaining({ sortOrder: 25 })));
  });

  test("allows refund only for an API-eligible paid payment", async () => {
    render(<PaymentManagementPanel canManage />);
    const reason = await screen.findByLabelText("退款原因 payment-1");
    fireEvent.change(reason, { target: { value: "Duplicate charge" } });
    expect(screen.getByRole("button", { name: "退款 payment-1" }).hasAttribute("disabled")).toBe(true);
  });

  test("clearly labels the recharge-plan and payment administration surface", async () => {
    render(<PaymentManagementPanel canManage />);

    expect(await screen.findByRole("heading", { name: "充值套餐与支付" })).toBeTruthy();
    expect(screen.getByText("修改仅影响新订单，已支付订单保留下单时的套餐快照。")).toBeTruthy();
  });

  test("keeps refund reasons and pending state attached to the selected order", async () => {
    listPayments.mockResolvedValue([{ ...payment, eligible: true }, { ...payment, id: "payment-2", merchantOrderId: "TF0002", eligible: true }]);
    let finish!: (value: unknown) => void;
    refundPayment.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<PaymentManagementPanel canManage />);
    fireEvent.change(await screen.findByLabelText("退款原因 payment-1"), { target: { value: "Duplicate payment confirmed" } });
    const first = screen.getByRole("button", { name: "退款 payment-1" });
    expect(screen.getByRole("button", { name: "退款 payment-2" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(first);
    fireEvent.click(first);
    expect(refundPayment).toHaveBeenCalledTimes(1);
    expect(refundPayment).toHaveBeenCalledWith("payment-1", "Duplicate payment confirmed");
    finish({ ...payment, status: "refund_pending" });
    expect(await screen.findByText("退款申请已提交，请以订单最终状态为准。")).toBeTruthy();
  });
});
