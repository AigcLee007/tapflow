import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { PaymentStatusPanel } from "./PaymentStatusPanel";

const payment = {
  amountCents: 990,
  checkoutUrl: "https://pay.example.test/order",
  credits: 100,
  expiresAtSnapshot: null,
  id: "payment-1",
  planKey: "credits_100",
  qrCodeUrl: "https://pay.example.test/qr.png",
  status: "checkout_created" as const,
};

afterEach(() => vi.unstubAllGlobals());

describe("PaymentStatusPanel", () => {
  test("shows the provider QR code on desktop", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    render(<PaymentStatusPanel payment={payment} />);
    expect(screen.getByRole("img", { name: "支付二维码" }).getAttribute("src")).toBe(payment.qrCodeUrl);
    expect(screen.getByText("微信扫码支付")).toBeTruthy();
    expect(screen.getByText("当前仅支持微信支付")).toBeTruthy();
    expect(screen.getByText("请使用微信扫一扫完成支付")).toBeTruthy();
    expect(screen.queryByText("支付状态")).toBeNull();
  });

  test("does not show a QR code on mobile after checkout redirects", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    render(<PaymentStatusPanel payment={payment} />);
    expect(screen.queryByRole("img", { name: "支付二维码" })).toBeNull();
  });

  test.each([
    ["pending", "等待支付"],
    ["checkout_created", "支付确认中"],
    ["paid", "已支付"],
    ["create_failed", "创建支付失败"],
    ["cancelled", "已取消"],
    ["refund_pending", "退款处理中"],
    ["refunded", "已退款"],
    ["refund_failed", "退款失败"],
  ] as const)("maps %s to %s", (status, label) => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    render(<PaymentStatusPanel payment={{ ...payment, status }} />);
    expect(screen.getByText("微信扫码支付")).toBeTruthy();
    expect(screen.getByText(label)).toBeTruthy();
  });
});
