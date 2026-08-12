import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { AuthDrawer } from "./AuthDrawer";

function renderDrawer(props: Partial<React.ComponentProps<typeof AuthDrawer>> = {}) {
  const onClose = vi.fn();
  const trigger = document.createElement("button");
  trigger.textContent = "Open auth";
  document.body.append(trigger);
  trigger.focus();
  const result = render(
    <AuthDrawer onClose={onClose} open pending={false} title="欢迎回来" {...props}>
      <input aria-label="邮箱" />
      <button type="button">继续</button>
    </AuthDrawer>,
  );
  return { ...result, onClose, trigger };
}

describe("AuthDrawer", () => {
  test("renders a right drawer with Chinese close control and traps focus", () => {
    const { onClose, trigger, unmount } = renderDrawer();
    const drawer = screen.getByRole("dialog", { name: "欢迎回来" });
    const focusable = Array.from(drawer.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])"));
    expect(drawer.getAttribute("data-placement")).toBe("right");
    expect(screen.getByRole("button", { name: "关闭登录面板" })).toBeTruthy();
    expect(screen.queryByText("让下一帧更有意义。 ")).toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(focusable[0]);
    focusable.at(-1)?.focus();
    fireEvent.keyDown(focusable.at(-1)!, { key: "Tab" });
    expect(document.activeElement).toBe(focusable[0]);
    fireEvent.keyDown(drawer, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  test("does not dismiss while a request is pending", () => {
    const { onClose } = renderDrawer({ pending: true });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.mouseDown(screen.getByTestId("auth-drawer-backdrop"));
    fireEvent.click(screen.getByRole("button", { name: "关闭登录面板" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  test("keeps body scroll locked until concurrent drawers close in any order", () => {
    function Harness() {
      const [first, setFirst] = React.useState(true);
      const [second, setSecond] = React.useState(true);
      return <><AuthDrawer onClose={() => setFirst(false)} open={first} pending={false} title="第一个"><button type="button">操作</button></AuthDrawer><AuthDrawer onClose={() => setSecond(false)} open={second} pending={false} title="第二个"><button type="button">操作</button></AuthDrawer></>;
    }
    document.body.style.overflow = "auto";
    render(<Harness />);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("dialog", { name: "第一个" }).querySelector("button[aria-label='关闭登录面板']")!);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("dialog", { name: "第二个" }).querySelector("button[aria-label='关闭登录面板']")!);
    expect(document.body.style.overflow).toBe("auto");
  });
});
