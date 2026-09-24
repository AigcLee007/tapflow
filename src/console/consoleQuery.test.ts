import { expect, test } from "vitest";
import { readConsoleQuery, buildConsoleUrl, changeConsoleFilters, formatConsoleCredits } from "./consoleQuery";

test("keeps only supported filters and never uses URL userId for personal queries", () => {
  expect(readConsoleQuery("?userId=other&status=failed&limit=500&token=secret&projectId=project-1", "self")).toEqual({status:"failed",limit:100,projectId:"project-1"});
  expect(readConsoleQuery("?userId=user-1&cursor=signed.cursor&asOf=2026-09-21T00%3A00%3A00Z", "platform")).toEqual({limit:50,userId:"user-1",cursor:"signed.cursor",asOf:"2026-09-21T00:00:00Z"});
});
test("filter changes invalidate the old snapshot and keyset cursor", () => {
  expect(changeConsoleFilters({limit:50,cursor:"old",asOf:"then",status:"failed"},{status:"succeeded"})).toEqual({limit:50,status:"succeeded"});
  expect(buildConsoleUrl("/admin/tasks",{limit:50,status:"failed",cursor:"signed+/="})).toBe("/admin/tasks?limit=50&status=failed&cursor=signed%2B%2F%3D");
});
test("credit formatting preserves decimal and large integer precision", () => {
  expect(formatConsoleCredits("9007199254740993.125" )).toBe("9,007,199,254,740,993.125");
  expect(formatConsoleCredits("-12.50")).toBe("-12.50");
  expect(formatConsoleCredits(null)).toBe("未知");
});
