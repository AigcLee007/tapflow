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
    expect(screen.getByRole("img", { name: "Payment QR code" }).getAttribute("src")).toBe(payment.qrCodeUrl);
  });

  test("does not show a QR code on mobile after checkout redirects", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    render(<PaymentStatusPanel payment={payment} />);
    expect(screen.queryByRole("img", { name: "Payment QR code" })).toBeNull();
  });
});
