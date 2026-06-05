import React, { useState } from "react";
import { Loader2, Ticket } from "lucide-react";

import { redeemBillingCode } from "./billingApi";

export function RedeemCodeBox({ onRedeemed }: { onRedeemed: () => Promise<void> | void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    if (!code.trim()) {
      setError("请输入兑换码。");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await redeemBillingCode(code);
      setCode("");
      setMessage(`已成功兑换 ${result.credits.toLocaleString()} 点。`);
      await onRedeemed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "兑换失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded border border-sky-400/20 bg-sky-400/10 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-sky-100">
        <Ticket size={16} />
        兑换码
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          className="h-10 flex-1 rounded border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-sky-300/60"
          onChange={(event) => setCode(event.target.value)}
          placeholder="输入兑换码"
          value={code}
        />
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded bg-sky-500 px-4 text-sm font-semibold text-white disabled:opacity-60"
          disabled={loading}
          onClick={() => void submit()}
          type="button"
        >
          {loading ? <Loader2 className="animate-spin" size={15} /> : <Ticket size={15} />}
          兑换
        </button>
      </div>
      {error && <div className="mt-2 text-xs text-red-300">{error}</div>}
      {message && <div className="mt-2 text-xs text-emerald-300">{message}</div>}
    </section>
  );
}
