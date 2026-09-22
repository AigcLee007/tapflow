import React, { useState } from "react";

import { useAuth } from "../auth/useAuth";
import { ConsoleRecordsPage } from "../console/ConsoleRecordsPage";
import { BillingSummaryCards } from "./BillingSummaryCards";
import { RechargeProvider, useRecharge, useRechargeContext } from "./RechargeContext";
import { RedeemCodeBox } from "./RedeemCodeBox";
import { useBillingSummarySnapshot } from "./useBillingSummarySnapshot";

function BillingCenterPageContent() {
  const { authenticated, user } = useAuth();
  const billingSnapshot = useBillingSummarySnapshot(Boolean(authenticated && user));
  const recharge = useRecharge();
  const [activityRevision, setActivityRevision] = useState(0);
  const refreshData = async () => { setActivityRevision(value => value + 1); };

  return <div className="min-w-0 bg-[#0b0b0d]">
    <div className="mx-auto max-w-[1440px]">
      <header><h1 className="text-2xl font-semibold text-white">个人钱包</h1><p className="mt-2 text-sm text-slate-400">积分属于个人账户，可在您加入的所有工作区中使用。</p></header>
      {billingSnapshot.status === "error" ? <p role="alert" className="mt-4 rounded border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">钱包余额加载失败，请稍后重试。</p> : null}
      <div className="mt-6"><BillingSummaryCards summary={billingSnapshot.summary} /></div>
      <section className="mt-6" data-testid="billing-recharge-section">
        <div className="rounded-2xl border border-lime-300/30 bg-lime-300/10 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><h2 className="text-lg font-semibold text-white">充值积分</h2><p className="mt-1 text-sm text-slate-300">选择积分套餐，使用微信支付完成充值。</p></div>
            <button className="rounded-xl bg-lime-300 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-lime-200" data-testid="billing-recharge-entry" onClick={() => recharge.openRecharge({ source: "billing" })} type="button">立即充值</button>
          </div>
        </div>
        <div className="mt-4"><RedeemCodeBox onRedeemed={refreshData} /></div>
      </section>
      <section className="mt-6" data-testid="billing-activity-section">
        <ConsoleRecordsPage scope="self" resource="activity" embedded reloadKey={activityRevision}/>
      </section>
    </div>
  </div>;
}

export function BillingCenterPage() {
  const context = useRechargeContext();
  if (!context) return <RechargeProvider><BillingCenterPageContent /></RechargeProvider>;
  return <BillingCenterPageContent />;
}
