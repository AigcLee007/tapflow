import { describe, expect, test } from "vitest";

import {
  promptAdminInputSchema,
  promptImportSchema,
  promptInteractionSchema,
  promptListQuerySchema,
} from "../src/modules/prompts/prompts.schemas.js";

describe("prompt schemas", () => {
  test("normalizes list filters and defaults to featured prompts", () => {
    expect(promptListQuerySchema.parse({ query: "  portrait ", limit: "12" })).toEqual({
      category: undefined,
      cursor: undefined,
      limit: 12,
      query: "portrait",
      view: "featured",
    });
  });

  test("accepts only supported interaction events", () => {
    expect(promptInteractionSchema.parse({ eventType: "copy", projectId: undefined })).toEqual({
      eventType: "copy",
      projectId: undefined,
    });
    expect(() => promptInteractionSchema.parse({ eventType: "delete" })).toThrow();
  });

  test("requires the main prompt and official category for admin records", () => {
    const result = promptAdminInputSchema.parse({
      category: "portrait",
      description: "Soft cinematic portrait",
      externalKey: "portrait-001",
      promptText: "cinematic portrait, soft side light",
      tags: ["cinematic", "soft-light"],
      title: "Cinematic portrait",
    });
    expect(result.status).toBe("draft");
    expect(() => promptAdminInputSchema.parse({ title: "Missing prompt" })).toThrow();
  });

  test("returns row-level import validation errors without accepting empty imports", () => {
    expect(promptImportSchema.safeParse({ rows: [] }).success).toBe(false);
    const result = promptImportSchema.safeParse({
      rows: [{ category: "portrait", externalKey: "p-1", promptText: "a prompt", title: "P1" }],
    });
    expect(result.success).toBe(true);
  });
});
