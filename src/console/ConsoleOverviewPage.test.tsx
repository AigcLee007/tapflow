import React from "react";
import { render, screen } from "@testing-library/react";
import { expect,test,vi } from "vitest";
import { AuthContext, type AuthState } from "../auth/useAuth";
import * as api from "../services/v2ConsoleApi";
import { ConsoleOverviewPage } from "./ConsoleOverviewPage";
vi.mock("../services/v2ConsoleApi",()=>({getConsoleOverview:vi.fn()}));
test("uses server aggregates and shows unknown upstream success rather than fabricated zero",async()=>{
 vi.mocked(api.getConsoleOverview).mockResolvedValue({scope:"platform",asOf:"2026-09-21T00:00:00Z",from:"2026-09-14T00:00:00Z",to:"2026-09-21T00:00:00Z",usage:{total:245,settled:210,unbilled:35,chargedCredits:"1234.125"},tasks:{total:400,bySource:{workflow:300,workbench:100}},generation:{total:200,succeeded:160,failed:20,canceled:10,pendingOrUnknown:10,successRate:0.8},upstream:{total:640,operationCoverage:"legacy",requestSuccessRate:null},dataQuality:"partial"});
 render(<AuthContext.Provider value={{user:{id:"u"},sessionId:"s"} as AuthState}><ConsoleOverviewPage scope="platform"/></AuthContext.Provider>);
 expect(await screen.findByText("245")).toBeTruthy();
 expect(screen.getByText("1,234.125")).toBeTruthy();
 expect(screen.getByText("上游请求成功率").parentElement?.textContent).toContain("未知");
 expect(screen.getByRole("link",{name:/查看生成任务/}).getAttribute("href")).toContain("from=");
});

test("shows the measured provider request success rate when request telemetry is available",async()=>{
 vi.mocked(api.getConsoleOverview).mockResolvedValue({scope:"platform",asOf:"2026-09-21T00:00:00Z",from:"2026-09-14T00:00:00Z",to:"2026-09-21T00:00:00Z",usage:{total:0,settled:0,unbilled:0,chargedCredits:"0"},tasks:{total:0,bySource:{}},generation:{total:0,succeeded:0,failed:0,canceled:0,pendingOrUnknown:0,successRate:null},upstream:{total:8,operationCoverage:"request",requestSuccessRate:0.875},dataQuality:"partial"});
 render(<AuthContext.Provider value={{user:{id:"u"},sessionId:"s"} as AuthState}><ConsoleOverviewPage scope="platform"/></AuthContext.Provider>);
 expect(await screen.findByText("87.5%")).toBeTruthy();
 expect(screen.getByText(/用户请求成功率基于物理上游请求/)).toBeTruthy();
});
