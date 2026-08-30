import { operationEnvelopeSchema, type CanvasOperationEnvelope } from "./canvas-operation-schema.js";

export type CanvasToolNamespace = "read" | "proposal" | "run" | "control";
export type CanvasTool = { namespace: CanvasToolNamespace; name: string; sideEffect: "none"; invoke: (input: unknown) => unknown };
const proposal = (input: any) => ({ kind: "operation_proposal", envelope: operationEnvelopeSchema.safeParse(input).success ? operationEnvelopeSchema.parse(input) : input });
export const canvasToolRegistry = {
  list(): CanvasTool[] { return [
    { namespace: "read", name: "get_graph", sideEffect: "none", invoke: (input) => ({ kind: "graph_context", input }) },
    { namespace: "proposal", name: "propose_operations", sideEffect: "none", invoke: proposal },
    { namespace: "run", name: "estimate_run", sideEffect: "none", invoke: (input) => ({ kind: "estimate", input }) },
    { namespace: "run", name: "execute_run", sideEffect: "none", invoke: (input) => ({ kind: "approval_bound_proposal", input }) },
    { namespace: "control", name: "request_approval", sideEffect: "none", invoke: (input) => ({ kind: "approval_request", input }) },
  ]; },
  invoke(namespace: CanvasToolNamespace, name: string, input: unknown): any { const tool = this.list().find((item) => item.namespace === namespace && item.name === name); if (!tool) throw new Error("Unknown canvas tool."); return tool.invoke(input); },
};
