import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { CanvasAgentCommandBar } from "./CanvasAgentCommandBar";

describe("CanvasAgentCommandBar", () => {
  it("submits a trimmed prompt and exposes runtime identity", () => { const submit = vi.fn(); const view = render(<CanvasAgentCommandBar runtimeIdentity="v3_real" onSubmit={submit} />); fireEvent.change(view.getByLabelText("Canvas Agent prompt"), { target: { value: "  organize  " } }); fireEvent.submit(view.getByRole("button", { name: "Send prompt" }).closest("form")!); expect(submit).toHaveBeenCalledWith("organize"); expect(view.getByText("v3_real")).toBeTruthy(); });
});
