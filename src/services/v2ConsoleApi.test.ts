import { beforeEach, expect, test, vi } from "vitest";
import * as http from "./v2HttpClient";
import { listConsoleRecords, getConsoleRecord, getConsoleOverview } from "./v2ConsoleApi";
vi.mock("./v2HttpClient", () => ({ apiGet: vi.fn() }));
beforeEach(()=>vi.clearAllMocks());
test("uses the independent self, platform, and authoritative billing endpoints", async () => {
  await listConsoleRecords("self","usage",{limit:50,status:"settled"});
  await listConsoleRecords("platform","calls",{limit:50,userId:"user-1"});
  await listConsoleRecords("self","activity",{limit:50,cursor:"cursor"});
  expect(http.apiGet).toHaveBeenNthCalledWith(1,"/me/usage-events?limit=50&status=settled");
  expect(http.apiGet).toHaveBeenNthCalledWith(2,"/admin/ai/calls?limit=50&userId=user-1");
  expect(http.apiGet).toHaveBeenNthCalledWith(3,"/billing/activity?limit=50&cursor=cursor");
});
test("encodes direct detail identifiers and keeps overview separate from list pages", async () => {
  await getConsoleRecord("platform","tasks","workflow:run/1");
  await getConsoleOverview("self",{limit:50});
  expect(http.apiGet).toHaveBeenCalledWith("/admin/tasks/workflow%3Arun%2F1");
  expect(http.apiGet).toHaveBeenCalledWith("/me/overview?limit=50");
});
