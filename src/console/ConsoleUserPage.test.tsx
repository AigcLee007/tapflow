import React from "react";
import { fireEvent,render,screen } from "@testing-library/react";
import { expect,test,vi } from "vitest";
import { AuthContext,type AuthState } from "../auth/useAuth";
import { ConsoleUserPage } from "./ConsoleUserPage";
import * as api from "../admin/adminApi";
vi.mock("../admin/adminApi",()=>({getAdminUser:vi.fn(),listAdminUserLedger:vi.fn()}));
test("keeps the personal wallet separate and requires an explicit workspace selection",async()=>{
 window.history.replaceState(null,"","/admin/users/user-1");
 vi.mocked(api.getAdminUser).mockResolvedValue({id:"user-1",email:"user@example.invalid",displayName:"用户",status:"active",createdAt:"2026-09-01",memberships:[{tenantId:"tenant-a",tenantName:"工作区 A",roleKey:"tenant_owner",membershipStatus:"active"},{tenantId:"tenant-b",tenantName:"工作区 B",roleKey:"tenant_viewer",membershipStatus:"active"}],wallet:{availableCredits:123,balanceCredits:123,reservedCredits:0,creditLedger:[]}} as never);
 vi.mocked(api.listAdminUserLedger).mockResolvedValue({pageSize:20,hasMore:true,nextCursor:"signed-next",from:"2026-06-21T00:00:00.000Z",to:"2026-09-19T00:00:00.000Z",asOf:"2026-09-19T00:00:00.000Z",items:[{id:"ledger-1",entryType:"admin_debit",amountCredits:"12",direction:"debit",tenantId:"tenant-a",usageEventId:null,createdAt:"2026-09-21T00:00:00.000Z"}]} as never);
 render(<AuthContext.Provider value={{user:{id:"actor"},sessionId:"session"} as AuthState}><ConsoleUserPage userId="user-1"/></AuthContext.Provider>);
 expect(await screen.findByText("user@example.invalid")).toBeTruthy();
 const usageLink=screen.getByRole("link",{name:"查看用户用量"});
 expect(usageLink.getAttribute("href")).toBe("/admin/usage?userId=user-1");
 expect(screen.getByRole("button",{name:/工作区关系 请选择工作区关系/})).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:/工作区关系 请选择工作区关系/}));
 fireEvent.click(screen.getByRole("menuitem",{name:"工作区 B"}));
 expect(screen.getByRole("link",{name:"查看用户用量"}).getAttribute("href")).toContain("tenantId=tenant-b");
 expect(await screen.findByText(/管理扣减/)).toBeTruthy();
 expect(screen.getByText("−12")).toBeTruthy();
 expect(api.listAdminUserLedger).toHaveBeenCalledWith("user-1",expect.objectContaining({limit:20}));
});

test("uses the selected 90-day window when loading older ledger entries",async()=>{
 window.history.replaceState(null,"","/admin/users/user-1?from=2026-06-21T00%3A00%3A00.000Z&to=2026-09-19T00%3A00%3A00.000Z");
 vi.mocked(api.getAdminUser).mockResolvedValue({id:"user-1",email:"user@example.invalid",displayName:"用户",status:"active",createdAt:"2026-09-01",memberships:[],wallet:{availableCredits:123,balanceCredits:123,reservedCredits:0,creditLedger:[]}} as never);
 vi.mocked(api.listAdminUserLedger).mockResolvedValue({pageSize:20,hasMore:false,nextCursor:null,from:"2026-06-21T00:00:00.000Z",to:"2026-09-19T00:00:00.000Z",asOf:"2026-09-19T00:00:00.000Z",items:[]} as never);
 render(<AuthContext.Provider value={{user:{id:"actor"},sessionId:"session"} as AuthState}><ConsoleUserPage userId="user-1"/></AuthContext.Provider>);
 await screen.findByText("user@example.invalid");
 expect(api.listAdminUserLedger).toHaveBeenCalledWith("user-1",expect.objectContaining({from:"2026-06-21T00:00:00.000Z",to:"2026-09-19T00:00:00.000Z"}));
});
