import { describe, expect, test } from "vitest";
import { ZodError } from "zod";

import { canvasOperationSchema, operationEnvelopeSchema } from "../src/modules/agent/v3/canvas-operation-schema.js";

const base = {
  operationSetId: "ops-1", taskId: "task-1", turnId: "turn-1", baseRevision: 4,
  summary: "Create a node", risk: "safe" as const, requiresApproval: false,
  operations: [{ type: "node.create" as const, node: { id: "n1", type: "image", position: { x: 0, y: 0 }, data: { assetId: "a1" } } }],
};

describe("canvas operation protocol", () => {
  test("accepts every supported operation type", () => {
    const ops = [
      { type: "node.create", node: { id: "n", type: "x", position: { x: 0, y: 0 }, data: {} } },
      { type: "node.update_data", nodeId: "n", data: { label: "x" } },
      { type: "node.delete", nodeId: "n" }, { type: "edge.connect", edge: { id: "e", source: "a", target: "b" } },
      { type: "edge.delete", edgeId: "e" }, { type: "group.create", group: { id: "g", nodeIds: ["n"] } },
      { type: "layout.move", nodeId: "n", position: { x: 1, y: 2 } }, { type: "selection.set", nodeIds: ["n"] },
      { type: "result.place", result: { assetId: "a1", position: { x: 0, y: 0 } } },
    ];
    expect(ops.every((op) => canvasOperationSchema.safeParse(op).success)).toBe(true);
  });

  test("rejects unknown operation and raw media or secret fields", () => {
    expect(canvasOperationSchema.safeParse({ type: "shell.exec", command: "rm" }).success).toBe(false);
    for (const value of ["data:image/png;base64,abc", "blob:https://x/y", "https://signed.example/x?X-Amz-Signature=x"]) {
      expect(operationEnvelopeSchema.safeParse({ ...base, operations: [{ type: "node.update_data", nodeId: "n", data: { preview: value } }] }).success).toBe(false);
    }
    expect(operationEnvelopeSchema.safeParse({ ...base, operations: [{ type: "node.update_data", nodeId: "n", data: { authorization: "Bearer x" } }] }).success).toBe(false);
  });

  test("enforces bounded envelope and revision fields", () => {
    expect(() => operationEnvelopeSchema.parse({ ...base, baseRevision: -1 })).toThrow(ZodError);
    expect(() => operationEnvelopeSchema.parse({ ...base, operations: [] })).toThrow(ZodError);
    expect(() => operationEnvelopeSchema.parse({ ...base, operations: Array.from({ length: 25 }, () => base.operations[0]) })).toThrow(ZodError);
    expect(operationEnvelopeSchema.parse({ ...base, preconditions: [{ revision: 4 }], expectedEffects: [{ nodes: ["created"] }], inverseOperations: base.operations })).toBeTruthy();
  });
});
