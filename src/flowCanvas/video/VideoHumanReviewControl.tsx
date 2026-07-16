import { BadgeCheck, ShieldAlert } from "lucide-react";

import type { VideoHumanReview } from "./videoTypes";

type VideoHumanReviewControlProps = {
  onRequestVerification?: () => void;
  value: VideoHumanReview;
};

export function VideoHumanReviewControl({ onRequestVerification, value }: VideoHumanReviewControlProps) {
  if (value.status === "not_required") return null;

  if (value.status === "verified") {
    return (
      <div aria-label="Human verification" className="flex min-h-[38px] items-center gap-[7px] text-[10px] font-medium text-emerald-100">
        <BadgeCheck aria-hidden="true" size={16} />
        <span className="min-w-0 flex-1 truncate">{formatVerifiedAt(value.verifiedAt)}</span>
        <button
          className="h-[30px] rounded-[9px] border border-white/10 px-2 text-[10px] font-bold text-white/80 transition hover:bg-white/[0.08] focus:border-sky-300/50 focus:outline-none"
          onClick={onRequestVerification}
          type="button"
        >
          Verify again
        </button>
      </div>
    );
  }

  return (
    <div
      aria-label="Human verification"
      className="flex min-h-[38px] items-center gap-[7px] rounded-[10px] border border-amber-300/25 bg-amber-300/10 px-2 text-[10px] font-medium text-amber-50"
      data-generation-blocked="true"
    >
      <ShieldAlert aria-hidden="true" size={16} />
      <span className="min-w-0 flex-1">Generation is blocked until human verification is complete.</span>
      <button
        className="h-[30px] shrink-0 rounded-[9px] bg-amber-200 px-2 text-[10px] font-bold text-black transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-sky-300/70"
        onClick={onRequestVerification}
        type="button"
      >
        Complete verification
      </button>
    </div>
  );
}

function formatVerifiedAt(value: string | undefined) {
  if (!value) return "Verified";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Verified" : `Verified ${date.toISOString()}`;
}
