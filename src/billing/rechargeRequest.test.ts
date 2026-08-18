import { afterEach, describe, expect, test, vi } from "vitest";

import { RECHARGE_REQUEST_EVENT, requestRecharge } from "./rechargeRequest";

describe("requestRecharge", () => {
  afterEach(() => vi.restoreAllMocks());

  test("dispatches the typed browser event", () => {
    const listener = vi.fn();
    window.addEventListener(RECHARGE_REQUEST_EVENT, listener);
    requestRecharge({ availableCredits: 1, requiredCredits: 2, source: "canvas" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ availableCredits: 1, requiredCredits: 2, source: "canvas" });
    window.removeEventListener(RECHARGE_REQUEST_EVENT, listener);
  });
});
