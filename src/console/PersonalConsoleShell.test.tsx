import React from "react";
import { render,screen } from "@testing-library/react";
import { expect,test } from "vitest";
import { AuthContext,type AuthState } from "../auth/useAuth";
import { PersonalConsoleShell } from "./PersonalConsoleShell";
test("marks personal details inside shared compact navigation without admin links for creators",()=>{
 const {container}=render(<AuthContext.Provider value={{roles:["tenant_owner"],permissions:[],user:{id:"u"}} as AuthState}><PersonalConsoleShell pathname="/account/usage/usage-1">记录详情</PersonalConsoleShell></AuthContext.Provider>);
 const current=screen.getByRole("link",{name:"使用明细"});
 expect(current.getAttribute("aria-current")).toBe("page");
 expect(current.className).toContain("h-[38px]");
 expect(current.querySelector("span")?.className).toContain("text-xs");
 expect(screen.queryByRole("link",{name:"管理控制台"})).toBeNull();
 expect(container.querySelector("select")).toBeNull();
});
