import { describe, expect, test } from "vitest";

import {
  isTerminalLegacyReservation,
  parseLegacyReservationMode,
  shouldRepairOrphanGrant,
} from "../src/personal-wallet-reconciliation.js";

describe("legacy reservation reconciliation decisions", () => {
  test("only failed and canceled workflow reservations are eligible", () => {
    expect(isTerminalLegacyReservation({ workflowStatus: "failed", nodeStatus: "failed" })).toBe(true);
    expect(isTerminalLegacyReservation({ workflowStatus: "canceled", nodeStatus: "pending" })).toBe(true);
    expect(isTerminalLegacyReservation({ workflowStatus: "succeeded", nodeStatus: "succeeded" })).toBe(false);
    expect(isTerminalLegacyReservation({ workflowStatus: "running", nodeStatus: "running" })).toBe(false);
    expect(isTerminalLegacyReservation({ workflowStatus: null, nodeStatus: "failed" })).toBe(false);
  });

  test("only positive orphan grant discrepancies are repairable", () => {
    expect(shouldRepairOrphanGrant({ grantReservedCredits: 200, rowReservedCredits: 0 })).toBe(true);
    expect(shouldRepairOrphanGrant({ grantReservedCredits: 0, rowReservedCredits: 0 })).toBe(false);
    expect(shouldRepairOrphanGrant({ grantReservedCredits: 1, rowReservedCredits: 2 })).toBe(false);
  });

  test("requires an explicit non-terminal cancellation flag for forced writes", () => {
    expect(parseLegacyReservationMode([
      "--write",
      "--confirm",
      "LEGACY_RESERVATION_RECONCILIATION",
      "--cancel-non-terminal",
    ])).toEqual({ dryRun: false, cancelNonTerminal: true });
    expect(parseLegacyReservationMode([
      "--write",
      "--confirm",
      "LEGACY_RESERVATION_RECONCILIATION",
    ])).toEqual({ dryRun: false, cancelNonTerminal: false });
  });
});
