import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { CanvasAgentTaskSheet } from "./CanvasAgentTaskSheet";

const task = { id: "t", status: "waiting_for_approval" as const, lastSequence: 1, events: [{ sequence: 1, type: "task_created", payload: { prompt: "make" } }] };
describe("CanvasAgentTaskSheet", () => { it("shows approval action for approval state", () => { const approve = vi.fn(); const view = render(<CanvasAgentTaskSheet task={task} onApprove={approve} />); fireEvent.click(view.getByRole("button", { name: "批准执行" })); expect(approve).toHaveBeenCalledOnce(); }); });
