import { describe, expect, test } from "vitest";
import { ZodError } from "zod";

import { assertCanvasOperationRevision, canvasOperationSchema, operationEnvelopeSchema } from "../src/modules/agent/v3/canvas-operation-schema.js";

const base = {
  operationSetId: "ops-1", taskId: "task-1", turnId: "turn-1", baseRevision: 4,
  summary: "Create a node", risk: "safe" as const, requiresApproval: false,
  preconditions: [], expectedEffects: [],
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
    for (const value of ["data:image/png;base64,abc", "blob:https://x/y", "https://signed.example/x?X-Amz-Signature=x", "ftp://example.test/file", "javascript:alert(1)", "//example.test/path"]) {
      expect(operationEnvelopeSchema.safeParse({ ...base, operations: [{ type: "node.update_data", nodeId: "n", data: { preview: value } }] }).success).toBe(false);
    }
    expect(operationEnvelopeSchema.safeParse({ ...base, operations: [{ type: "node.update_data", nodeId: "n", data: { authorization: "Bearer x" } }] }).success).toBe(false);
  });

  test("enforces bounded envelope and revision fields", () => {
    expect(() => operationEnvelopeSchema.parse({ ...base, baseRevision: -1 })).toThrow(ZodError);
    expect(() => operationEnvelopeSchema.parse({ ...base, operations: [] })).toThrow(ZodError);
    expect(() => operationEnvelopeSchema.parse({ ...base, operations: Array.from({ length: 25 }, () => base.operations[0]) })).toThrow(ZodError);
    expect(operationEnvelopeSchema.parse({ ...base, preconditions: [{ revision: 4 }], expectedEffects: [{ nodes: ["created"] }], inverseOperations: base.operations })).toBeTruthy();
    expect(() => operationEnvelopeSchema.parse({ ...base, preconditions: undefined })).toThrow(ZodError);
    expect(() => operationEnvelopeSchema.parse({ ...base, expectedEffects: undefined })).toThrow(ZodError);
  });

  test("accepts a mixed revisioned create/update/connect set", () => {
    const result = operationEnvelopeSchema.parse({ ...base, operations: [
      base.operations[0], { type: "node.update_data", nodeId: "n1", data: { label: "updated" } },
      { type: "edge.connect", edge: { id: "e1", source: "n1", target: "n2" } },
    ] });
    expect(result.operations).toHaveLength(3);
  });

  test("rejects a stale envelope revision before application", () => {
    expect(() => assertCanvasOperationRevision(base, 5)).toThrow("stale");
    expect(assertCanvasOperationRevision(base, 4)).toBe(true);
  });

  test("rejects cyclic and excessively deep unsafe payloads without overflowing", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const cyclicResult = operationEnvelopeSchema.safeParse({ ...base, operations: [{ type: "node.update_data", nodeId: "n1", data: { cyclic } }] });
    expect(cyclicResult.success).toBe(false);
    let deep: Record<string, unknown> = {};
    const root = deep;
    for (let i = 0; i < 140; i++) { deep.next = {}; deep = deep.next as Record<string, unknown>; }
    expect(operationEnvelopeSchema.safeParse({ ...base, operations: [{ type: "node.update_data", nodeId: "n1", data: root }] }).success).toBe(false);
  });
});
