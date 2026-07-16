import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { VideoHumanReviewControl } from "./VideoHumanReviewControl";

describe("VideoHumanReviewControl", () => {
  test("hides the entry when human review is not required", () => {
    render(<VideoHumanReviewControl value={{ status: "not_required" }} />);

    expect(screen.queryByLabelText("Human verification")).toBeNull();
  });

  test.each(["required", "expired"] as const)("blocks generation and requests verification for %s status", (status) => {
    const onRequestVerification = vi.fn();
    render(<VideoHumanReviewControl onRequestVerification={onRequestVerification} value={{ status }} />);

    expect(screen.getByText("Generation is blocked until human verification is complete.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Complete verification" }));
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

    expect(screen.getByText("Verified 2026-07-16T08:00:00.000Z")).toBeTruthy();
    expect(screen.queryByText("verify-safe-1")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Verify again" }));
    expect(onRequestVerification).toHaveBeenCalledOnce();
  });
});
