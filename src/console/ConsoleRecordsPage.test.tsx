import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthContext, type AuthState } from "../auth/useAuth";
import * as api from "../services/v2ConsoleApi";
import { ConsoleRecordsPage } from "./ConsoleRecordsPage";
vi.mock("../services/v2ConsoleApi",()=>({listConsoleRecords:vi.fn(),getConsoleRecord:vi.fn()}));
const meta = {scope:"self",from:"2026-09-14T00:00:00.000Z",to:"2026-09-21T00:00:00.000Z",asOf:"2026-09-21T00:00:00.000Z",pageSize:50,hasMore:true,nextCursor:"signed-cursor"};
const usage = {id:"usage-1",usageEventId:"event-1",tenantId:"tenant-1",userId:"user-1",projectId:null,source:"workflow",taskId:"task-1",nodeRunId:null,modelId:null,routeId:null,modality:"image",status:"settled",executionStatus:"succeeded",billingStatus:"settled",chargedCredits:"9007199254740993.125",inputTokens:null,outputTokens:null,quantity:"1",unit:"image",createdAt:meta.to,dataQuality:"partial"};
function show(props: Partial<React.ComponentProps<typeof ConsoleRecordsPage>> = {}) {
 return render(<AuthContext.Provider value={{authenticated:true,user:{id:"user-1"},sessionId:"session-1"} as AuthState}><ConsoleRecordsPage scope="self" resource="usage" {...props}/></AuthContext.Provider>);
}
beforeEach(()=>{ vi.clearAllMocks(); window.history.replaceState(null,"","/account/usage");vi.mocked(api.listConsoleRecords).mockResolvedValue({...meta,items:[usage]} as never);vi.mocked(api.getConsoleRecord).mockResolvedValue({item:usage} as never); });
test("paginates using the server cursor and frozen window in URL",async()=>{
 show();
 expect(await screen.findByText("9,007,199,254,740,993.125")).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"下一页"}));
 await waitFor(()=>expect(api.listConsoleRecords).toHaveBeenLastCalledWith("self","usage",expect.objectContaining({cursor:"signed-cursor",asOf:meta.asOf,from:meta.from,to:meta.to})));
 expect(new URLSearchParams(window.location.search).get("cursor")).toBe("signed-cursor");
});
test("filter submission clears pagination and personal queries omit user selectors",async()=>{
 window.history.replaceState(null,"","/account/usage?cursor=old&asOf=then&userId=other");show();
 await screen.findByRole("button",{name:"下一页"});
 expect(screen.queryByLabelText("用户 ID")).toBeNull();
 fireEvent.change(screen.getByLabelText("项目 ID"),{target:{value:"project-new"}});
 fireEvent.click(screen.getByRole("button",{name:"应用筛选"}));
 await waitFor(()=>expect(api.listConsoleRecords).toHaveBeenLastCalledWith("self","usage",{limit:50,projectId:"project-new"}));
 expect(window.location.search).not.toMatch(/cursor|asOf|userId/);
});
test("renders safe direct details and related task/ledger links without raw provider data",async()=>{
 vi.mocked(api.getConsoleRecord).mockResolvedValue({item:{...usage,errorJson:{secret:"do-not-render"},requestJson:{prompt:"private-prompt"}}} as never);
 show({detailId:"usage-1"});
 expect(await screen.findByText("usage-1")).toBeTruthy();
 expect(screen.getByRole("link",{name:"查看生成任务"}).getAttribute("href")).toContain("/account/tasks/");
 expect(screen.getByRole("link",{name:"查看个人账本"}).getAttribute("href")).toContain("/billing");
 expect(screen.queryByText(/do-not-render|private-prompt/)).toBeNull();
 expect(api.listConsoleRecords).not.toHaveBeenCalled();
});
test("shows a retryable request failure rather than an empty successful result",async()=>{
 vi.mocked(api.listConsoleRecords).mockRejectedValueOnce(new Error("查询服务暂不可用"));show();
 expect(await screen.findByRole("alert")).toHaveProperty("textContent",expect.stringContaining("查询服务暂不可用"));
 fireEvent.click(screen.getByRole("button",{name:"重试"}));
 expect(await screen.findByText("9,007,199,254,740,993.125")).toBeTruthy();
});
test("uses actual wallet ledger event types in its shared menu",async()=>{
 vi.mocked(api.listConsoleRecords).mockResolvedValue({...meta,items:[]} as never);
 show({resource:"activity"});
 fireEvent.click(screen.getByRole("button",{name:"账务类型 全部"}));
 expect(screen.getByRole("menuitem",{name:"管理扣减"})).toBeTruthy();
 expect(screen.queryByRole("menuitem",{name:"释放预留"})).toBeNull();
 fireEvent.click(screen.getByRole("menuitem",{name:"管理扣减"}));
 fireEvent.click(screen.getByRole("button",{name:"应用筛选"}));
 await waitFor(()=>expect(api.listConsoleRecords).toHaveBeenLastCalledWith("self","activity",expect.objectContaining({status:"admin_debit"})));
});
test("renders a positive admin debit as a debit",async()=>{
 vi.mocked(api.listConsoleRecords).mockResolvedValue({...meta,hasMore:false,nextCursor:null,items:[{id:"entry-1",entryType:"admin_debit",amountCredits:"12",direction:"debit",tenantId:null,usageEventId:null,createdAt:meta.to}]} as never);
 show({resource:"activity"});
 expect(await screen.findByText("−12")).toBeTruthy();
});
test("labels physical provider requests separately from historical summaries",async()=>{
 const call = {id:"call-1",tenantId:"tenant-1",workflowRunId:null,nodeRunId:null,modelId:null,routeId:null,productModelKey:"image-model",routeKey:"route-a",routeLabel:"线路一",status:"http_succeeded",recordLevel:"request",operation:"poll",trafficClass:"user_generation",transportStatus:"http_succeeded",executionId:"execution-1",attempt:2,httpStatus:200,latencyMs:120,inputTokens:null,outputTokens:null,createdAt:meta.to,dataQuality:"partial"};
 vi.mocked(api.listConsoleRecords).mockResolvedValue({...meta,items:[call]} as never);
 show({scope:"platform",resource:"calls"});
 expect(await screen.findByText("物理请求 · 轮询 · HTTP 成功")).toBeTruthy();
  expect(screen.getByText("第 2 次 · HTTP 200")).toBeTruthy();
});
test("uses transport status choices for physical provider requests",async()=>{
 const call = {id:"call-1",tenantId:"tenant-1",workflowRunId:null,nodeRunId:null,modelId:null,routeId:null,productModelKey:"image-model",routeKey:"route-a",routeLabel:"线路一",status:"http_failed",recordLevel:"request",operation:"poll",trafficClass:"user_generation",transportStatus:"http_failed",executionId:"execution-1",attempt:2,httpStatus:500,latencyMs:120,inputTokens:null,outputTokens:null,createdAt:meta.to,dataQuality:"partial"};
 vi.mocked(api.listConsoleRecords).mockResolvedValue({...meta,items:[call]} as never);
 show({scope:"platform",resource:"calls"});
 await screen.findByText("物理请求 · 轮询 · HTTP 失败");
 fireEvent.click(screen.getByRole("button",{name:"状态 全部"}));
 fireEvent.click(screen.getByRole("menuitem",{name:"HTTP 失败"}));
 fireEvent.click(screen.getByRole("button",{name:"应用筛选"}));
 await waitFor(()=>expect(api.listConsoleRecords).toHaveBeenLastCalledWith("platform","calls",expect.objectContaining({status:"http_failed"})));
});
test("filters provider calls by traffic class",async()=>{
 vi.mocked(api.listConsoleRecords).mockResolvedValue({...meta,items:[]} as never);
 show({scope:"platform",resource:"calls"});
 fireEvent.click(screen.getByRole("button",{name:"流量类型 全部流量"}));
 fireEvent.click(screen.getByRole("menuitem",{name:"线路测试"}));
 fireEvent.click(screen.getByRole("button",{name:"应用筛选"}));
 await waitFor(()=>expect(api.listConsoleRecords).toHaveBeenLastCalledWith("platform","calls",expect.objectContaining({trafficClass:"admin_test"})));
});
test("labels and filters payment refund ledger entries",async()=>{
 vi.mocked(api.listConsoleRecords).mockResolvedValue({...meta,items:[{id:"entry-refund",entryType:"payment_refund",amountCredits:"12",direction:"debit",tenantId:null,usageEventId:null,createdAt:meta.to}]} as never);
 show({resource:"activity"});
 expect(await screen.findByText("支付退款")).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"账务类型 全部"}));
 fireEvent.click(screen.getByRole("menuitem",{name:"支付退款"}));
 fireEvent.click(screen.getByRole("button",{name:"应用筛选"}));
 await waitFor(()=>expect(api.listConsoleRecords).toHaveBeenLastCalledWith("self","activity",expect.objectContaining({status:"payment_refund"})));
});
test("sends usage billing status as a billing filter",async()=>{
 vi.mocked(api.listConsoleRecords).mockResolvedValue({...meta,items:[]} as never);
 show({resource:"usage"});
 fireEvent.click(screen.getByRole("button",{name:"计费状态 全部"}));
 fireEvent.click(screen.getByRole("menuitem",{name:"已预留"}));
 fireEvent.click(screen.getByRole("button",{name:"应用筛选"}));
 await waitFor(()=>expect(api.listConsoleRecords).toHaveBeenLastCalledWith("self","usage",expect.objectContaining({billingStatus:"reserved"})));
});
test("shows physical request transport fields in its safe detail view",async()=>{
 const call = {id:"call-1",tenantId:"tenant-1",workflowRunId:null,nodeRunId:null,modelId:null,routeId:null,productModelKey:"image-model",routeKey:"route-a",routeLabel:"线路一",status:"http_succeeded",recordLevel:"request",operation:"poll",trafficClass:"user_generation",transportStatus:"http_succeeded",executionId:"execution-1",attempt:2,httpStatus:200,latencyMs:120,inputTokens:null,outputTokens:null,createdAt:meta.to,dataQuality:"partial"};
 vi.mocked(api.getConsoleRecord).mockResolvedValue({item:call} as never);
 show({scope:"platform",resource:"calls",detailId:"call-1"});
 expect(await screen.findByText("物理上游请求")).toBeTruthy();
 expect(screen.getByText("用户生成")).toBeTruthy();
 expect(screen.getByText("第 2 次")).toBeTruthy();
 expect(screen.getByText("200")).toBeTruthy();
 expect(screen.getAllByText("HTTP 成功").length).toBe(2);
 expect(screen.queryByText(/private-prompt|do-not-render/)).toBeNull();
});
test("shows task timeline and safe provider attempt diagnostics",async()=>{
 const task = {id:"workflow-1",sourceId:"00000000-0000-4000-8000-000000000001",tenantId:"tenant-1",userId:"user-1",projectId:null,source:"workflow",status:"failed",createdAt:meta.to,startedAt:meta.to,finishedAt:meta.to,dataQuality:"partial",timeline:[{id:"task:1",kind:"task",label:"created",status:"running",nodeRunId:null,executionId:"exec-1",attempt:null,createdAt:meta.to,finishedAt:null},{id:"node:1",kind:"node",label:"video.generate",status:"failed",nodeRunId:null,executionId:"exec-1",attempt:1,createdAt:meta.to,finishedAt:meta.to}],attempts:[{id:"call-1",nodeRunId:null,executionId:"exec-1",attempt:1,operation:"submit",transportStatus:"http_failed",trafficClass:"user_generation",providerRequestId:"req-1",providerTaskId:"task-1",traceId:"trace-1",httpStatus:500,latencyMs:120,connectionName:"Primary",upstreamModel:"vendor/model-v1",productModelKey:"image",routeKey:"route-a",routeLabel:"线路一",errorCode:"HTTP_500",requestStartedAt:meta.to,requestCompletedAt:meta.to,createdAt:meta.to}],diagnostics:{actorUserId:"user-1",billedUserId:"user-1",traceIds:["trace-1"],providerRequestIds:["req-1"],providerTaskIds:["task-1"],connectionNames:["Primary"],upstreamModels:["vendor/model-v1"],errorCodes:["HTTP_500"]}};
 vi.mocked(api.getConsoleRecord).mockResolvedValue({item:task} as never);
 show({scope:"platform",resource:"tasks",detailId:"workflow:00000000-0000-4000-8000-000000000001"});
 expect(await screen.findByText("任务时间线")).toBeTruthy();
 expect(screen.getByText("video.generate")).toBeTruthy();
 expect(screen.getByText("上游请求尝试")).toBeTruthy();
 expect(screen.getByText("HTTP_500")).toBeTruthy();
 expect(screen.getByText("Primary")).toBeTruthy();
 expect(screen.queryByText(/private-prompt|private-output/)).toBeNull();
});
