import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AuthContext, type AuthState } from "../auth/useAuth";
import * as api from "./platformAuditApi";
import { PlatformAuditPage } from "./PlatformAuditPage";

vi.mock("./platformAuditApi", () => ({ listPlatformAudit: vi.fn() }));

test("lists audit events and carries its signed pagination cursor", async () => {
  vi.mocked(api.listPlatformAudit).mockResolvedValue({ scope: "platform", from: "2026-09-14T00:00:00.000Z", to: "2026-09-21T00:00:00.000Z", asOf: "2026-09-21T00:00:00.000Z", pageSize: 50, hasMore: true, nextCursor: "signed-next", items: [{ id: "event-1", action: "ai.route.operate", actorUserId: "user-1", resourceType: "ai_route", resourceId: "route-1", tenantId: "tenant-1", requestId: "request-1", traceId: "trace-1", reason: "暂时停用", statusBefore: "active", statusAfter: "disabled", createdAt: "2026-09-21T00:00:00.000Z" }] } as never);
  render(<AuthContext.Provider value={{ user: { id: "operator" }, sessionId: "session" } as AuthState}><PlatformAuditPage /></AuthContext.Provider>);
  expect(await screen.findByText("ai.route.operate")).toBeTruthy();
  expect(screen.getByText("暂时停用")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "下一页" }));
  await waitFor(() => expect(api.listPlatformAudit).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "signed-next", asOf: "2026-09-21T00:00:00.000Z" })));
});
