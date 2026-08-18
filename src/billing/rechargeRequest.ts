export const RECHARGE_REQUEST_EVENT = "v2-recharge-request";

export type RechargeRequestDetail = {
  availableCredits?: number;
  requiredCredits?: number;
  source: "canvas" | "shell" | "workbench" | "billing" | "account";
};

export function requestRecharge(detail: RechargeRequestDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<RechargeRequestDetail>(RECHARGE_REQUEST_EVENT, { detail }));
}
