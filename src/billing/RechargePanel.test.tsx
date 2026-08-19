import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { type RechargePlan } from "./billingApi";
import { RechargePanel } from "./RechargePanel";

function makePlan(overrides: Partial<RechargePlan>): RechargePlan {
  return {
    id: overrides.id ?? "plan-1",
    key: overrides.key ?? "plan-1",
    name: overrides.name ?? "套餐 1",
    amountCents: overrides.amountCents ?? 990,
    credits: overrides.credits ?? 100,
    currency: overrides.currency ?? "CNY",
    validityDays: overrides.validityDays ?? 365,
    sortOrder: overrides.sortOrder ?? 10,
  };
}

describe("RechargePanel", () => {
  const onSelect = vi.fn();
  const onRetry = vi.fn();

  const plans = [
    makePlan({ id: "plan-3", key: "credits_3300", name: "3300 AI credits", amountCents: 20000, credits: 3300, sortOrder: 30 }),
    makePlan({ id: "plan-1", key: "credits_100", name: "100 AI credits", amountCents: 990, credits: 100, sortOrder: 10 }),
    makePlan({ id: "plan-2", key: "credits_700", name: "700 AI credits", amountCents: 5000, credits: 700, sortOrder: 20 }),
    makePlan({ id: "plan-4", key: "credits_1500", name: "1500 AI credits", amountCents: 10000, credits: 1500, sortOrder: 25 }),
  ];

  beforeEach(() => {
    onSelect.mockReset();
    onRetry.mockReset();
  });

  test("renders four aliased plan cards with approved bonus breakdown and no unit-price or renewal copy", () => {
    render(
      <RechargePanel
        busyPlanKey={null}
        onRetry={onRetry}
        onSelect={onSelect}
        plans={plans}
        status="ready"
      />,
    );

    expect(screen.getByRole("heading", { name: "充值积分" })).toBeTruthy();
    expect(screen.getByTestId("recharge-plan-grid").className).toContain("lg:grid-cols-4");
    expect(screen.getByText("轻量尝鲜")).toBeTruthy();
    expect(screen.getByText("日常创作")).toBeTruthy();
    expect(screen.getByText("高频创作")).toBeTruthy();
    expect(screen.getByText("专业创作")).toBeTruthy();
    expect(screen.getByText("加赠 200 积分")).toBeTruthy();
    expect(screen.getByText("加赠 500 积分")).toBeTruthy();
    expect(screen.getByText("加赠 1,300 积分")).toBeTruthy();
    expect(screen.queryByText(/\/ 积分|自动续费|一次购买/)).toBeNull();
  });

  test("marks the second sorted plan as recommended and keeps its cta filled", () => {
    render(
      <RechargePanel
        busyPlanKey={null}
        onRetry={onRetry}
        onSelect={onSelect}
        plans={plans}
        status="ready"
      />,
    );

    expect(screen.getAllByText("最受欢迎")).toHaveLength(1);
    const ctas = screen.getAllByRole("button", { name: "立即充值" });
    expect(ctas).toHaveLength(4);
    expect(ctas[1].className).toContain("bg-lime-300");
  });

  test("passes the selected plan to onSelect", () => {
    render(
      <RechargePanel
        busyPlanKey={null}
        onRetry={onRetry}
        onSelect={onSelect}
        plans={plans}
        status="ready"
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "立即充值" })[1]);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "plan-2",
        key: "credits_700",
        name: "700 AI credits",
        amountCents: 5000,
        credits: 700,
        currency: "CNY",
        validityDays: 365,
        sortOrder: 20,
      }),
    );
  });

  test("renders loading skeletons with a stable three-card layout", () => {
    render(
      <RechargePanel
        busyPlanKey={null}
        onRetry={onRetry}
        onSelect={onSelect}
        plans={[]}
        status="loading"
      />,
    );

    expect(screen.getAllByTestId("recharge-plan-skeleton")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "立即充值" })).toBeNull();
  });

  test("moves the active highlight to the hovered card while keeping the recommendation ribbon", () => {
    render(<RechargePanel busyPlanKey={null} onRetry={onRetry} onSelect={onSelect} plans={plans} status="ready" />);

    const cards = screen.getAllByTestId("recharge-plan-card");
    expect(cards[1].className).toContain("ring-2");
    fireEvent.mouseEnter(cards[2]);
    expect(cards[2].className).toContain("ring-2");
    expect(cards[1].className).not.toContain("ring-2");
    expect(screen.getByText("最受欢迎")).toBeTruthy();
    fireEvent.mouseLeave(cards[2]);
    expect(cards[1].className).toContain("ring-2");
  });

  test("offers retry when loading plans fails", () => {
    render(
      <RechargePanel
        busyPlanKey={null}
        onRetry={onRetry}
        onSelect={onSelect}
        plans={[]}
        status="error"
      />,
    );

    expect(screen.getByText("套餐加载失败")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重新加载套餐" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test("shows an empty ready state without a purchase cta", () => {
    render(
      <RechargePanel
        busyPlanKey={null}
        onRetry={onRetry}
        onSelect={onSelect}
        plans={[]}
        status="ready"
      />,
    );

    expect(screen.getByText("暂无可用套餐")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "立即充值" })).toBeNull();
  });
});
