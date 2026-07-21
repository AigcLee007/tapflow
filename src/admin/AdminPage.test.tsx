import { describe, expect, it } from "vitest";

describe("AdminPage module", () => {
  it("loads when the prompt library tab is registered", async () => {
    const module = await import("./AdminPage");

    expect(module.AdminPage).toEqual(expect.any(Function));
  });
});
