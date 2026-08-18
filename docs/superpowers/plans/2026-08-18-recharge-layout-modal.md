# 充值单行布局与支付弹窗 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make desktop recharge plans render as four cards in one row and keep payment QR/status content inside a centered modal after checkout.

**Architecture:** Keep plan selection in `RechargePanel`, payment state in `RechargeContext`, and modal positioning/scroll locking in `RechargeDialog`. The billing page will render the plan section only; payment status is shown by the portal dialog, including return-to-billing deep links.

**Tech Stack:** React, TypeScript, Tailwind utility classes, Vitest, Testing Library, Vite.

---

### Task 1: Add failing layout and modal regression tests

**Files:**
- Modify: `src/billing/RechargePanel.test.tsx`
- Modify: `src/billing/BillingCenterPage.test.tsx`

- [ ] **Step 1: Assert four-card desktop grid contract**

Update the fixture assertion to require `lg:grid-cols-4` and render four server plans in the same test. Keep the mobile behavior responsive by asserting only the desktop token, not a fixed mobile column count.

- [ ] **Step 2: Assert checkout QR is inside a dialog**

In the existing checkout polling test, stop the payment mock at `checkout_created`, click the first plan, then assert:

```tsx
expect(await screen.findByRole("dialog", { name: "充值积分" })).toBeTruthy();
expect(screen.getByRole("img", { name: "支付二维码" })).toHaveAttribute("src", "https://pay.example.test/qr");
expect(screen.queryByTestId("billing-inline-payment-status")).toBeNull();
```

- [ ] **Step 3: Run the focused tests and verify the new assertions fail**

Run:

```bash
npm test -- src/billing/RechargePanel.test.tsx src/billing/BillingCenterPage.test.tsx
```

Expected: the current three-column token and inline-payment assumptions fail before production code changes.

### Task 2: Implement four-column plan layout and modal-only payment rendering

**Files:**
- Modify: `src/billing/RechargePanel.tsx`
- Modify: `src/billing/BillingCenterPage.tsx`
- Modify: `src/billing/RechargeContext.tsx`
- Modify: `src/billing/RechargeDialog.tsx`

- [ ] **Step 1: Use four columns at the desktop breakpoint**

Change ready and loading grid classes from `lg:grid-cols-3` to `lg:grid-cols-4`. Keep the existing card min-height, recommendation styling, sorting, and CTA behavior unchanged.

- [ ] **Step 2: Remove the billing page inline payment panel**

Keep the recharge section and its error message, but remove the `PaymentStatusPanel` import and the conditional `!recharge.dialogOpen` block. Add `data-testid="billing-inline-payment-status"` only if needed by a regression test; the final implementation should not render that element.

- [ ] **Step 3: Make the dialog explicitly centered and viewport-safe**

Keep the portal on `document.body`, add a dialog label that includes the current title, and use a centered fixed overlay with a bounded `max-h`. Keep body scroll locking, Escape, backdrop dismissal, close focus, and internal scrolling. Ensure the payment panel is rendered only within this dialog after checkout.

- [ ] **Step 4: Open the dialog after an order is created from any entry point**

In `RechargeContext.beginCheckout`, call `setDialogOpen(true)` after `startCheckout` returns a payment. This covers the billing page, where the user can select a plan before the dialog is open, while preserving the existing error path when checkout creation returns `null`.

### Task 3: Verify behavior and polish

**Files:**
- Test: `src/billing/RechargePanel.test.tsx`
- Test: `src/billing/BillingCenterPage.test.tsx`
- Test: `src/billing/PaymentStatusPanel.test.tsx`

- [ ] **Step 1: Run focused recharge tests**

```bash
npm test -- src/billing/RechargePanel.test.tsx src/billing/BillingCenterPage.test.tsx src/billing/PaymentStatusPanel.test.tsx
```

Expected: all tests pass, including four-column and dialog QR assertions.

- [ ] **Step 2: Run the production build**

```bash
npm run build
```

Expected: Vite exits with code 0 and writes the build version.

- [ ] **Step 3: Review the diff and commit the implementation**

```bash
git diff --check
git status --short
git add src/billing/RechargePanel.tsx src/billing/BillingCenterPage.tsx src/billing/RechargeDialog.tsx src/billing/RechargePanel.test.tsx src/billing/BillingCenterPage.test.tsx
git commit -m "fix: center recharge payment modal"
```
