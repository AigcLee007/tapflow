import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { RedeemCodeBox } from "./RedeemCodeBox";

const redeemBillingCodeMock = vi.fn();

vi.mock("./billingApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./billingApi")>()),
  redeemBillingCode: (code: string) => redeemBillingCodeMock(code),
}));

describe("RedeemCodeBox", () => {
  beforeEach(() => redeemBillingCodeMock.mockReset());

  test("hides English server errors behind a Chinese fallback", async () => {
    redeemBillingCodeMock.mockRejectedValueOnce(new Error("Internal error"));
    render(<RedeemCodeBox onRedeemed={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("输入兑换码"), { target: { value: "TEST-CODE" } });
    fireEvent.click(screen.getByRole("button", { name: "兑换" }));

    expect(await screen.findByText("兑换失败，请稍后重试。")).toBeTruthy();
    expect(screen.queryByText("Internal error")).toBeNull();
  });
});
