import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { AuthGate } from "./AuthGate";

vi.mock("./useAuth", () => ({
  useAuth: () => ({
    authenticated: false,
    loading: true,
  }),
}));

describe("AuthGate", () => {
  test("renders branded workspace loading while auth is loading", () => {
    render(
      <AuthGate>
        <div>workspace</div>
      </AuthGate>,
    );

    expect(screen.getByText("正在加载工作区...")).toBeTruthy();
    expect(screen.getByTestId("brand-transition").getAttribute("data-variant")).toBe("auth");
  });
});
