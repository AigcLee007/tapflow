import { expect,test,vi } from "vitest";
import { adjustAdminCredits, grantAdminCredits, searchAdminUsers } from "./adminApi";
import { apiGet, apiPost } from "../services/v2HttpClient";
vi.mock("../services/v2HttpClient",()=>({apiGet:vi.fn(),apiPost:vi.fn()}));
test("passes bound cursor and user filters to server user search",async()=>{
 await searchAdminUsers("Name",50,{cursor:"signed=",status:"disabled",platformRole:"platform_operator",tenantId:"tenant-1"});
 const url=vi.mocked(apiGet).mock.calls[0][0];
 const params=new URLSearchParams(url.split("?")[1]);
 expect(params.get("cursor")).toBe("signed=");expect(params.get("platformRole")).toBe("platform_operator");expect(params.get("status")).toBe("disabled");expect(params.get("tenantId")).toBe("tenant-1");
});
test("passes retry-stable idempotency keys for both wallet mutations",async()=>{
 const payload={credits:20,reason:"人工审批补偿",targetUserId:"user-1",tenantId:"tenant-1",idempotencyKey:"intent-1"};
 await grantAdminCredits(payload);
 expect(apiPost).toHaveBeenLastCalledWith("/admin/users/user-1/grant-credits",expect.objectContaining({idempotencyKey:"intent-1"}));
 await adjustAdminCredits({...payload,direction:"subtract",idempotencyKey:"intent-2"});
 expect(apiPost).toHaveBeenLastCalledWith("/admin/users/user-1/adjust-credits",expect.objectContaining({idempotencyKey:"intent-2",direction:"subtract"}));
});
