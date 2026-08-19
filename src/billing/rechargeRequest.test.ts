import { afterEach, describe, expect, test, vi } from "vitest";

import { RECHARGE_REQUEST_EVENT, requestRecharge } from "./rechargeRequest";

describe("rechargeRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("emits one exact recharge request event", () => {
    const listener = vi.fn();
    window.addEventListener(RECHARGE_REQUEST_EVENT, listener as EventListener);

    const detail = { availableCredits: 120, requiredCredits: 340, source: "canvas" as const };
    requestRecharge(detail);

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0]?.[0] as CustomEvent<typeof detail>).detail).toEqual(detail);
  });

  test("does nothing when window is unavailable", () => {
    vi.stubGlobal("window", undefined);

    expect(() =>
      requestRecharge({
        source: "billing",
      }),
    ).not.toThrow();
  });
});
