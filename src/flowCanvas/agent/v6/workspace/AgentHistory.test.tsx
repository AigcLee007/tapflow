import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AgentHistory, dateLabel, type AgentHistoryItem } from "./AgentHistory";

const items: AgentHistoryItem[] = [
  { id: "today", title: "今日方案", date: "2026-09-09" },
  { id: "yesterday", title: "昨日草稿", date: "2026-09-08" },
  { id: "older", title: "旧草稿", date: "2026-09-01" },
];

describe("AgentHistory", () => {
  it("formats date groups against an injected clock", () => {
    const now = new Date("2026-09-09T12:00:00");

    expect(dateLabel("2026-09-09", now)).toBe("今天");
    expect(dateLabel("2026-09-08", now)).toBe("昨天");
    expect(dateLabel("2026-09-01", now)).toBe("2026年9月1日");
  });

  it("dismisses on Escape and outside pointer down", () => {
    const onClose = vi.fn();
    render(<AgentHistory items={items} onClose={onClose} onSelect={vi.fn()} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();

    cleanup();
    render(<AgentHistory items={items} onClose={onClose} onSelect={vi.fn()} />);
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("complementary", { name: "对话历史" })).toBeTruthy();
  });
});
