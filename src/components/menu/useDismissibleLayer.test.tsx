import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { useDismissibleLayer } from "./useDismissibleLayer";

function TestMenuPair() {
  const first = useDismissibleLayer("first");
  const second = useDismissibleLayer("second");

  return (
    <div>
      <button ref={first.triggerRef} onClick={first.toggle}>
        Open First
      </button>
      <button ref={second.triggerRef} onClick={second.toggle}>
        Open Second
      </button>
      {first.open ? (
        <div ref={first.ref} role="menu">
          First Menu
        </div>
      ) : null}
      {second.open ? (
        <div ref={second.ref} role="menu">
          Second Menu
        </div>
      ) : null}
    </div>
  );
}

describe("useDismissibleLayer", () => {
  test("closes the first layer when a second layer opens", () => {
    render(<TestMenuPair />);
    fireEvent.click(screen.getByRole("button", { name: "Open First" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Second" }));
    expect(screen.queryByText("First Menu")).toBeNull();
    expect(screen.getByText("Second Menu")).toBeTruthy();
  });

  test("closes the active layer on Escape", () => {
    render(<TestMenuPair />);
    fireEvent.click(screen.getByRole("button", { name: "Open First" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("First Menu")).toBeNull();
  });

  test("does not close the active layer on inside pointerdown", () => {
    render(<TestMenuPair />);
    fireEvent.click(screen.getByRole("button", { name: "Open First" }));
    fireEvent.pointerDown(screen.getByRole("menu"));
    expect(screen.getByText("First Menu")).toBeTruthy();
  });

  test("clicking the trigger while open toggles the layer closed", () => {
    render(<TestMenuPair />);
    const trigger = screen.getByRole("button", { name: "Open First" });
    fireEvent.click(trigger);
    expect(screen.getByText("First Menu")).toBeTruthy();
    fireEvent.click(trigger);
    expect(screen.queryByText("First Menu")).toBeNull();
  });

  test("closes the active layer on outside pointerdown", () => {
    render(<TestMenuPair />);
    fireEvent.click(screen.getByRole("button", { name: "Open First" }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByText("First Menu")).toBeNull();
  });
});
