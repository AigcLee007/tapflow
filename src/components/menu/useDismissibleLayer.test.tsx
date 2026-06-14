import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { useDismissibleLayer } from "./useDismissibleLayer";

function TestMenuPair() {
  const first = useDismissibleLayer("first");
  const second = useDismissibleLayer("second");

  return (
    <div>
      <button onClick={first.toggle}>Open First</button>
      <button onClick={second.toggle}>Open Second</button>
      {first.open ? <div role="menu">First Menu</div> : null}
      {second.open ? <div role="menu">Second Menu</div> : null}
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

  test("closes the active layer on outside pointerdown", () => {
    render(<TestMenuPair />);
    fireEvent.click(screen.getByRole("button", { name: "Open First" }));
    fireEvent.pointerDown(window);
    expect(screen.queryByText("First Menu")).toBeNull();
  });
});
