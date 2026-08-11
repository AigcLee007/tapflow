import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { AuthDialog } from "./AuthDialog";

function renderDialog(props: Partial<React.ComponentProps<typeof AuthDialog>> = {}) {
  const onClose = vi.fn();
  const trigger = document.createElement("button");
  trigger.textContent = "Open auth";
  document.body.append(trigger);
  trigger.focus();
  const result = render(
    <AuthDialog onClose={onClose} open pending={false} title="Login" {...props}>
      <input aria-label="Email" />
      <button type="button">Continue</button>
    </AuthDialog>,
  );
  return { ...result, onClose, trigger };
}

describe("AuthDialog", () => {
  test("traps focus, locks scroll, and restores invoking focus after close", () => {
    const { onClose, trigger, unmount } = renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Login" });
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])"));
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(focusable[0]);
    focusable.at(-1)?.focus();
    fireEvent.keyDown(focusable.at(-1)!, { key: "Tab" });
    expect(document.activeElement).toBe(focusable[0]);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  test("does not dismiss while a request is pending", () => {
    const { onClose } = renderDialog({ pending: true });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.mouseDown(screen.getByTestId("auth-dialog-backdrop"));
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  test("keeps body scroll locked until concurrent dialogs close in any order", () => {
    function Harness() {
      const [first, setFirst] = React.useState(true);
      const [second, setSecond] = React.useState(true);
      return <><AuthDialog onClose={() => setFirst(false)} open={first} pending={false} title="First"><button type="button">First action</button></AuthDialog><AuthDialog onClose={() => setSecond(false)} open={second} pending={false} title="Second"><button type="button">Second action</button></AuthDialog></>;
    }
    document.body.style.overflow = "auto";
    render(<Harness />);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("dialog", { name: "First" }).querySelector("button[aria-label='Close dialog']")!);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("dialog", { name: "Second" }).querySelector("button[aria-label='Close dialog']")!);
    expect(document.body.style.overflow).toBe("auto");
  });
});
