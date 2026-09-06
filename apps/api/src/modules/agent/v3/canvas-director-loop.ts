import type { CanvasDirectorContext } from "./agent-context-assembler.js";

export type CanvasDirectorMode = "observe" | "plan" | "preview" | "execute" | "verify" | "repair";
export type CanvasAgentTaskStatus =
  | "draft" | "observing" | "planning" | "preview_ready" | "waiting_for_input"
  | "waiting_for_approval" | "applying_canvas_ops" | "running" | "verifying"
  | "repairing" | "needs_review" | "succeeded" | "partial_success" | "failed" | "cancelled";

export type CanvasDirectorInput = { taskId: string; tenantId: string; projectId: string; flowId: string; graphRevision: number; prompt: string; context?: CanvasDirectorContext };
export type CanvasDirectorDecision =
  | { type: "read"; tool?: string }
  | { type: "plan"; actions: string[]; summary?: string }
  | { type: "preview"; risk: "safe" | "destructive" | "paid" | "batch"; requiresApproval: boolean }
  | { type: "input_required"; prompt: string }
  | { type: "run"; runId: string; asynchronous: boolean }
  | { type: "repair"; reason: string }
  | { type: "tool_call"; namespace: string; name: string; input?: unknown }
  | { type: "finish"; delivery: { kind: string; verified?: boolean } };

export type CanvasDirectorEvent = {
  taskId: string; sequence: number; type: string; status: CanvasAgentTaskStatus;
  mode?: CanvasDirectorMode; plan?: { actions: string[]; summary?: string }; message?: string;
};
export type CanvasDirectorResult = { taskId: string; status: CanvasAgentTaskStatus; code?: string; sequence?: number };
type StoredTask = CanvasDirectorResult & { sequence?: number };
type RunResult = { state: string; output?: unknown };
type Delivery = { verified: boolean; kind: string; reason?: string };

type Options = {
  decide: (input: { task: CanvasDirectorInput; mode: CanvasDirectorMode; round: number }) => Promise<CanvasDirectorDecision>;
  persist: (event: CanvasDirectorEvent) => Promise<void>;
  load?: (taskId: string) => Promise<StoredTask | null | undefined>;
  waitForRun?: (runId: string) => Promise<RunResult>;
  verifyDelivery?: (input: { task: CanvasDirectorInput; output?: unknown; delivery?: { kind: string } }) => Promise<Delivery>;
  maxRounds?: number;
  repairAttempts?: number;
};

const terminal = new Set<CanvasAgentTaskStatus>(["succeeded", "partial_success", "failed", "cancelled"]);

export class CanvasDirectorLoop {
  private readonly options: Options;
  private readonly tasks = new Map<string, StoredTask>();
  private readonly resumes = new Map<string, { input?: string; approved?: boolean }>();

  constructor(options: Options) { this.options = options; }

  async run(input: CanvasDirectorInput): Promise<CanvasDirectorResult> {
    const loaded = await this.options.load?.(input.taskId) ?? this.tasks.get(input.taskId);
    if (loaded && terminal.has(loaded.status)) return loaded;
    return this.drive(input);
  }

  async resume(input: { taskId: string; input?: string; approved?: boolean }): Promise<CanvasDirectorResult> {
    this.resumes.set(input.taskId, input);
    const existing = this.tasks.get(input.taskId);
    if (!existing) return { taskId: input.taskId, status: "failed", code: "AGENT_TASK_NOT_FOUND" };
    const task = this.resumedInput(input.taskId);
    return this.drive({ taskId: input.taskId, tenantId: "", projectId: "", flowId: "", graphRevision: 0, prompt: task?.input ?? "resume" });
  }

  private resumedInput(taskId: string) { return this.resumes.get(taskId); }

  private async drive(input: CanvasDirectorInput): Promise<CanvasDirectorResult> {
    let round = 0;
    let repairs = 0;
    let mode: CanvasDirectorMode = "observe";
    let sequence = this.tasks.get(input.taskId)?.sequence ?? 0;
    let output: unknown;
    let verified = false;
    const emit = async (status: CanvasAgentTaskStatus, type: string, extra: Partial<CanvasDirectorEvent> = {}) => {
      const event: CanvasDirectorEvent = { taskId: input.taskId, sequence: ++sequence, type, status, mode, ...extra };
      this.tasks.set(input.taskId, { taskId: input.taskId, status, sequence });
      await this.options.persist(event);
    };

    while (round < (this.options.maxRounds ?? 8)) {
      round++;
      const decision = await this.options.decide({ task: input, mode, round });
      if (decision.type === "read") { mode = "observe"; await emit("observing", "observation"); continue; }
      if (decision.type === "plan") { mode = "plan"; await emit("planning", "plan", { plan: { actions: decision.actions, summary: decision.summary } }); continue; }
      if (decision.type === "preview") {
        mode = "preview"; await emit("preview_ready", "preview");
        if (decision.requiresApproval || decision.risk !== "safe") { await emit("waiting_for_approval", "approval_required"); return this.result(input.taskId, "waiting_for_approval", sequence); }
        continue;
      }
      if (decision.type === "input_required") { await emit("waiting_for_input", "input_required", { message: decision.prompt }); return this.result(input.taskId, "waiting_for_input", sequence); }
      if (decision.type === "tool_call") { await emit("repairing", "repair_required", { message: "Invalid or unavailable tool call." }); mode = "repair"; continue; }
      if (decision.type === "run") {
        mode = "execute"; await emit("running", "run_started");
        const run = this.options.waitForRun ? await this.options.waitForRun(decision.runId) : { state: "succeeded" };
        if (run.state !== "succeeded") { await emit("failed", "run_failed", { message: run.state }); return this.result(input.taskId, "failed", sequence, "AGENT_RUN_FAILED"); }
        output = run.output;
        mode = "verify"; await emit("verifying", "delivery_verification");
        const check = this.options.verifyDelivery ? await this.options.verifyDelivery({ task: input, output }) : { verified: true, kind: "unknown" };
        verified = check.verified;
        if (!verified) { mode = "repair"; }
        continue;
      }
      if (decision.type === "repair") {
        if (repairs >= (this.options.repairAttempts ?? 1)) { await emit("failed", "repair_limit_exceeded", { message: decision.reason }); return this.result(input.taskId, "failed", sequence, "AGENT_REPAIR_LIMIT_EXCEEDED"); }
        repairs++; mode = "repair"; await emit("repairing", "repair_started", { message: decision.reason }); continue;
      }
      if (decision.type === "finish") {
        mode = "verify";
        if (!verified) {
          await emit("verifying", "delivery_verification");
          const check = this.options.verifyDelivery ? await this.options.verifyDelivery({ task: input, output, delivery: decision.delivery }) : { verified: decision.delivery.verified === true, kind: decision.delivery.kind };
          if (!check.verified) { mode = "repair"; continue; }
        }
        await emit("succeeded", "task_succeeded");
        return this.result(input.taskId, "succeeded", sequence);
      }
    }
    await emit("failed", "round_limit_exceeded");
    return this.result(input.taskId, "failed", sequence, "AGENT_TOOL_ROUND_LIMIT_EXCEEDED");
  }

  private result(taskId: string, status: CanvasAgentTaskStatus, sequence: number, code?: string): CanvasDirectorResult { const result = { taskId, status, sequence, ...(code ? { code } : {}) }; this.tasks.set(taskId, result); return result; }
}
