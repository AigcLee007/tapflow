import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { VideoHumanReviewControl } from "./VideoHumanReviewControl";

describe("VideoHumanReviewControl", () => {
  test("hides the entry when human review is not required", () => {
    render(<VideoHumanReviewControl value={{ status: "not_required" }} />);

    expect(screen.queryByLabelText("真人验证")).toBeNull();
  });

  test.each(["required", "expired"] as const)("blocks generation and requests verification for %s status", (status) => {
    const onRequestVerification = vi.fn();
    render(<VideoHumanReviewControl onRequestVerification={onRequestVerification} value={{ status }} />);

    expect(screen.getByText("完成真人验证后才能生成视频。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "完成验证" }));
    expect(onRequestVerification).toHaveBeenCalledOnce();
  });

  test("shows safe verification metadata and allows re-verification", () => {
    const onRequestVerification = vi.fn();
    render(
      <VideoHumanReviewControl
        onRequestVerification={onRequestVerification}
        value={{ status: "verified", verifiedAt: "2026-07-16T08:00:00.000Z", verificationRef: "verify-safe-1" }}
      />,
    );

    expect(screen.getByText("已验证：2026年7月16日 16:00")).toBeTruthy();
    expect(screen.queryByText(/T08:00:00\.000Z/)).toBeNull();
    expect(screen.queryByText("verify-safe-1")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重新验证" }));
    expect(onRequestVerification).toHaveBeenCalledOnce();
  });
});
