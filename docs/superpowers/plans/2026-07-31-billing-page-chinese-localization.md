# 账单充值页完整汉化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/billing` 页面全部用户可见英文改为简体中文，并保持支付、轮询、余额刷新和页面布局不变。

**Architecture:** 只在现有 `src/billing` 展示组件内替换文案，并为支付枚举增加纯展示映射。接口字段和英文状态码保持不变；异常区域使用固定中文兜底，避免透传英文技术信息。

**Tech Stack:** React 19、TypeScript、Vitest、Testing Library、Vite

---

### Task 1: 页面标题、余额卡片和充值套餐汉化

**Files:**
- Modify: `src/billing/BillingCenterPage.test.tsx`
- Modify: `src/billing/BillingCenterPage.tsx`
- Modify: `src/billing/BillingSummaryCards.tsx`
- Modify: `src/billing/RechargePanel.tsx`

- [ ] **Step 1: 写入页面汉化失败测试**

在 `BillingCenterPage.test.tsx` 的固定套餐测试中断言：

```tsx
expect(await screen.findByRole("heading", { name: "个人钱包" })).toBeTruthy();
expect(screen.getByText("积分属于个人账户，可在您加入的所有工作区中使用。")).toBeTruthy();
expect(screen.getByText("可用积分")).toBeTruthy();
expect(screen.getByText("预留积分")).toBeTruthy();
expect(screen.getByText("即将到期")).toBeTruthy();
expect(screen.getByText("最近到期")).toBeTruthy();
expect(screen.getByText("充值积分")).toBeTruthy();
expect(screen.getByText("￥9.90")).toBeTruthy();
expect(screen.getByText("100 积分，有效期 365 天")).toBeTruthy();
expect(screen.queryByText("Personal wallet")).toBeNull();
expect(screen.queryByText("Recharge credits")).toBeNull();
```

测试文件从 Testing Library 引入 `fireEvent`，并在账单 API mock 中增加：

```tsx
const createPaymentCheckoutMock = vi.fn();

createPaymentCheckout: (input: { planKey: string; idempotencyKey: string }) =>
  createPaymentCheckoutMock(input),
```

再增加加载失败和创建支付失败测试：

```tsx
getBillingSummaryMock.mockRejectedValueOnce(new Error("Unable to load wallet"));
renderPage();
expect(await screen.findByText("钱包加载失败，请稍后重试。")).toBeTruthy();
expect(screen.queryByText("Unable to load wallet")).toBeNull();

createPaymentCheckoutMock.mockRejectedValueOnce(new Error("Unable to create payment checkout"));
renderPage();
fireEvent.click(await screen.findByRole("button", { name: /￥9\.90/ }));
expect(await screen.findByText("创建支付订单失败，请稍后重试。")).toBeTruthy();
expect(screen.queryByText("Unable to create payment checkout")).toBeNull();
```

- [ ] **Step 2: 运行测试确认按预期失败**

Run: `npx vitest run src/billing/BillingCenterPage.test.tsx`

Expected: FAIL，找不到“个人钱包”“可用积分”“￥9.90”等中文文案。

- [ ] **Step 3: 最小化修改页面文案**

在 `BillingCenterPage.tsx` 使用：

```tsx
setError("钱包加载失败，请稍后重试。");

<h1 className="text-2xl font-semibold text-white">个人钱包</h1>
<p className="mt-2 text-sm text-slate-400">
  积分属于个人账户，可在您加入的所有工作区中使用。
</p>
```

在 `BillingSummaryCards.tsx` 使用以下四张卡片：

```tsx
const cards = [
  { icon: CircleDollarSign, label: "可用积分", value: credits(summary?.availableCredits ?? 0), hint: "可直接使用" },
  { icon: LockKeyhole, label: "预留积分", value: credits(summary?.reservedCredits ?? 0), hint: "正在执行的任务占用" },
  { icon: Clock3, label: "即将到期", value: credits(summary?.expiringSoonCredits ?? 0), hint: "30 天内到期" },
  { icon: Timer, label: "最近到期", value: summary?.nearestExpiryAt ? new Date(summary.nearestExpiryAt).toLocaleDateString("zh-CN") : "暂无", hint: "优先使用最早到期的积分" },
];
```

在 `RechargePanel.tsx` 使用：

```tsx
setMessage("创建支付订单失败，请稍后重试。");

<CreditCard size={16} />充值积分
<span className="block font-semibold">￥{(plan.amountCents / 100).toFixed(2)}</span>
<span className="text-xs text-slate-400">
  {plan.credits.toLocaleString()} 积分，有效期 {plan.validityDays} 天
</span>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/billing/BillingCenterPage.test.tsx`

Expected: PASS，所有页面主体和套餐文案均为中文。

### Task 2: 支付状态和二维码汉化

**Files:**
- Modify: `src/billing/PaymentStatusPanel.test.tsx`
- Modify: `src/billing/PaymentStatusPanel.tsx`

- [ ] **Step 1: 写入完整支付状态失败测试**

将二维码断言改为中文，并增加状态表驱动测试：

```tsx
expect(screen.getByRole("img", { name: "支付二维码" }).getAttribute("src")).toBe(payment.qrCodeUrl);

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
  expect(screen.getByText("支付状态")).toBeTruthy();
  expect(screen.getByText(label)).toBeTruthy();
});
```

- [ ] **Step 2: 运行测试确认按预期失败**

Run: `npx vitest run src/billing/PaymentStatusPanel.test.tsx`

Expected: FAIL，当前组件仍显示 `Payment status`、`Paid` 或 `Confirming payment`。

- [ ] **Step 3: 实现纯展示状态映射**

在 `PaymentStatusPanel.tsx` 增加：

```tsx
const PAYMENT_STATUS_LABELS: Record<WalletPayment["status"], string> = {
  pending: "等待支付",
  checkout_created: "支付确认中",
  paid: "已支付",
  create_failed: "创建支付失败",
  cancelled: "已取消",
  refund_pending: "退款处理中",
  refunded: "已退款",
  refund_failed: "退款失败",
};
```

标题、状态和二维码替代文本分别使用：

```tsx
const statusClass = `mt-2 text-sm ${
  completed ? "text-emerald-300" : terminalFailure ? "text-red-300" : "text-amber-200"
}`;

<div className="text-sm font-semibold text-white">支付状态</div>
<p className={statusClass}>{PAYMENT_STATUS_LABELS[payment.status]}</p>
<img alt="支付二维码" className="mt-3 h-44 w-44 bg-white p-2" src={payment.qrCodeUrl} />
```

保持现有桌面端二维码显示条件和移动端跳转行为不变。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/billing/PaymentStatusPanel.test.tsx src/billing/BillingCenterPage.test.tsx`

Expected: PASS，八种支付状态和二维码文本均为中文。

### Task 3: 异常文案审计、回归验证和项目记录

**Files:**
- Create: `src/billing/RedeemCodeBox.test.tsx`
- Modify: `src/billing/RedeemCodeBox.tsx`
- Modify: `src/billing/billingActivity.ts`
- Modify: `src/billing/billingActivity.test.ts`
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: 写入兑换失败中文兜底测试**

模拟 `redeemBillingCode` 抛出英文错误并断言页面只显示中文：

```tsx
redeemBillingCodeMock.mockRejectedValueOnce(new Error("Internal error"));
render(<RedeemCodeBox onRedeemed={vi.fn()} />);
fireEvent.change(screen.getByPlaceholderText("输入兑换码"), { target: { value: "TEST-CODE" } });
fireEvent.click(screen.getByRole("button", { name: "兑换" }));
expect(await screen.findByText("兑换失败，请稍后重试。")).toBeTruthy();
expect(screen.queryByText("Internal error")).toBeNull();
```

- [ ] **Step 2: 运行测试确认按预期失败**

Run: `npx vitest run src/billing/RedeemCodeBox.test.tsx`

Expected: FAIL，当前组件透传 `Internal error`。

- [ ] **Step 3: 修改异常兜底并消除活动列表残留英文**

在 `RedeemCodeBox.tsx` 的兑换异常分支固定显示：

```tsx
setError("兑换失败，请稍后重试。");
```

在 `billingActivity.ts` 中将 Agent 事件显示名改为：

```tsx
if (event.includes("agent")) return "智能体任务";
```

在 `billingActivity.test.ts` 增加智能体用量事件并断言：

```tsx
const agentUsage: BillingUsageEvent = {
  billableCents: 1,
  createdAt: "2026-07-31T01:00:00.000Z",
  eventType: "agent.run",
  id: "usage-agent-1",
  idempotencyKey: "agent:usage:1",
  metadata: {},
  modality: "agent",
  modelId: null,
  nodeRunId: null,
  rawCost: null,
  routeId: null,
  status: "settled",
  unitType: null,
  units: "1",
  workflowRunId: null,
};

expect(buildBillingActivityRows([agentUsage], [], createCatalog())[0]?.eventLabel)
  .toBe("智能体任务");
```

- [ ] **Step 4: 扫描账单页残留英文文案**

Run:

```bash
rg -n 'Personal wallet|Your credits|Available credits|Ready to use|Reserved credits|Held for active jobs|Expiring soon|Expires within 30 days|Nearest expiry|Oldest credits spend first|Recharge credits|Payment status|Confirming payment|Payment QR code|Unable to' src/billing
```

Expected: 无生产组件匹配；测试中的“不得出现英文”断言允许保留。

- [ ] **Step 5: 运行账单回归测试和生产构建**

Run:

```bash
npx vitest run src/billing/BillingCenterPage.test.tsx src/billing/PaymentStatusPanel.test.tsx src/billing/RedeemCodeBox.test.tsx src/billing/billingActivity.test.ts
npm run build
```

Expected: 所有测试通过，Vite 构建退出码为 0；允许项目现有的 chunk-size 和 dynamic-import 警告。

- [ ] **Step 6: 更新项目记录**

在 `PROJECT_RECORD.md` 增加 2026-07-31 账单页汉化记录，包含修改范围和验证命令。

- [ ] **Step 7: 提交并推送**

```bash
git add PROJECT_RECORD.md src/billing/BillingCenterPage.tsx src/billing/BillingCenterPage.test.tsx src/billing/BillingSummaryCards.tsx src/billing/RechargePanel.tsx src/billing/PaymentStatusPanel.tsx src/billing/PaymentStatusPanel.test.tsx src/billing/RedeemCodeBox.tsx src/billing/RedeemCodeBox.test.tsx src/billing/billingActivity.ts src/billing/billingActivity.test.ts docs/superpowers/plans/2026-07-31-billing-page-chinese-localization.md
git commit -m "feat(billing): localize wallet page in Chinese"
git push origin codex/xunhupay-personal-wallet
git push origin HEAD:main
```
