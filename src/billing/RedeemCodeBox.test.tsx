import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { RedeemCodeBox } from "./RedeemCodeBox";

const redeemBillingCodeMock = vi.fn();

vi.mock("./billingApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./billingApi")>()),
  redeemBillingCode: (code: string) => redeemBillingCodeMock(code),
}));

describe("RedeemCodeBox", () => {
  beforeEach(() => redeemBillingCodeMock.mockReset());

  test("shows an actionable Chinese message for a known redeem error code", async () => {
    const error = new Error("Internal error") as Error & { code?: string };
    error.code = "REDEEM_CODE_EXPIRED";
    redeemBillingCodeMock.mockRejectedValueOnce(error);
    render(<RedeemCodeBox onRedeemed={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("输入兑换码"), { target: { value: "TEST-CODE" } });
    fireEvent.click(screen.getByRole("button", { name: "兑换" }));

    expect(await screen.findByText("兑换码已过期，无法使用。")).toBeTruthy();
    expect(screen.queryByText("Internal error")).toBeNull();
  });

  test("hides unknown server errors behind a Chinese fallback", async () => {
    redeemBillingCodeMock.mockRejectedValueOnce(new Error("Internal error"));
    render(<RedeemCodeBox onRedeemed={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("输入兑换码"), { target: { value: "TEST-CODE" } });
    fireEvent.click(screen.getByRole("button", { name: "兑换" }));

    expect(await screen.findByText("兑换失败，请稍后重试。")).toBeTruthy();
    expect(screen.queryByText("Internal error")).toBeNull();
  });

  test("invalidates shared wallet summaries after redeeming", async () => {
    redeemBillingCodeMock.mockResolvedValueOnce({ credits: 100 });
    const listener = vi.fn();
    window.addEventListener("v2-billing-summary-invalidate", listener);
    render(<RedeemCodeBox onRedeemed={vi.fn()} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "TEST-CODE" } });
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(listener).toHaveBeenCalledOnce());
    window.removeEventListener("v2-billing-summary-invalidate", listener);
  });
});
