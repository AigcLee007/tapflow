import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConversationRenderer } from "./ConversationRenderer";

describe("canonical question_set renderer", () => {
  it("fills all questions and sends one answer_question decision", async () => {
    const onDecision = vi.fn().mockResolvedValue(undefined);
    render(<ConversationRenderer pendingDecision={{ blockId: "questions", type: "answer_question" }} blocks={[{ type: "question_set", id: "questions", questions: [
      { id: "name", prompt: "商品名", kind: "text", required: true },
      { id: "audience", prompt: "受众", kind: "single", options: [{ id: "adult", label: "成人" }], required: true },
      { id: "channels", prompt: "渠道", kind: "multiple", options: [{ id: "taobao", label: "淘宝" }], required: true },
    ] }]} onDecision={onDecision} />);
    const button = screen.getByRole("button", { name: "回答当前问题" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "商品名" }), { target: { value: "夏季连衣裙" } });
    fireEvent.click(screen.getByRole("radio", { name: "成人" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "淘宝" }));
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(onDecision).toHaveBeenCalledTimes(1));
    expect(onDecision).toHaveBeenCalledWith({ blockId: "questions", type: "answer_question", payload: { answers: { name: "夏季连衣裙", audience: "adult", channels: ["taobao"] } } });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders confirmation actions only from allowedTypes and locks duplicate clicks", async () => {
    const onDecision = vi.fn(() => new Promise((resolve) => setTimeout(resolve, 5)));
    render(<ConversationRenderer pendingDecision={{ blockId: "confirm", type: "approve_plan", allowedTypes: ["approve_plan", "revise_plan"] }} blocks={[{ type: "confirmation", id: "confirm", text: "确认计划" }]} onDecision={onDecision} />);
    const approve = screen.getByRole("button", { name: "确认执行" });
    const revise = screen.getByRole("button", { name: "修改计划" });
    fireEvent.click(approve); fireEvent.click(approve); fireEvent.click(revise);
    await waitFor(() => expect(onDecision).toHaveBeenCalledTimes(1));
    expect(onDecision).toHaveBeenCalledWith(expect.objectContaining({ type: "approve_plan", blockId: "confirm" }));
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    expect((revise as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders server recovery actions and unlocks after a failed request", async () => {
    const onDecision = vi.fn().mockRejectedValueOnce(new Error("offline"));
    render(<ConversationRenderer pendingDecision={{ blockId: "recover", type: "retry_execution", allowedTypes: ["retry_execution", "revise_plan"] }} blocks={[{ type: "error_recovery", id: "recover", message: "失败", actions: [{ id: "retry", label: "重试", action: "retry" }, { id: "revise", label: "修改计划", action: "revise" }] }]} onDecision={onDecision} />);
    const retry = screen.getByRole("button", { name: "重试" });
    fireEvent.click(retry);
    await waitFor(() => expect((retry as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(retry);
    await waitFor(() => expect(onDecision).toHaveBeenCalledTimes(2));
  });
});
