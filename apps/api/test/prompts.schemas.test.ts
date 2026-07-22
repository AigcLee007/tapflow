import { describe, expect, test } from "vitest";

import {
  promptAdminInputSchema,
  promptImportSchema,
  promptInteractionSchema,
  promptListQuerySchema,
  promptMediaVariantQuerySchema,
  promptReorderSchema,
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

  test("requires at least one language and accepts the fixed video category", () => {
    const result = promptAdminInputSchema.parse({
      category: "video",
      description: "Soft cinematic portrait",
      externalKey: "portrait-001",
      promptTextZh: "电影感人像，柔和侧光",
      tags: ["cinematic", "soft-light"],
      title: "Cinematic portrait",
    });
    expect(result.status).toBe("draft");
    expect(result.promptTextZh).toContain("电影感");
    expect(promptAdminInputSchema.safeParse({
      category: "portrait", description: "", externalKey: "p-2", promptTextEn: "English only", tags: [], title: "P2",
    }).success).toBe(true);
    expect(promptAdminInputSchema.safeParse({
      category: "unknown", description: "", externalKey: "p-3", promptTextEn: "Prompt", tags: [], title: "P3",
    }).success).toBe(false);
    expect(promptAdminInputSchema.safeParse({
      category: "portrait", description: "", externalKey: "p-4", promptTextEn: " ", promptTextZh: "", tags: [], title: "P4",
    }).success).toBe(false);
  });

  test("returns row-level import validation errors without accepting empty imports", () => {
    expect(promptImportSchema.safeParse({ rows: [] }).success).toBe(false);
    const result = promptImportSchema.safeParse({
      rows: [{ category: "portrait", externalKey: "p-1", promptText: "a prompt", title: "P1" }],
    });
    expect(result.success).toBe(true);
  });

  test("maps legacy import promptText to English and validates order and media variants", () => {
    const parsed = promptImportSchema.parse({
      rows: [{ category: "portrait", externalKey: "legacy-1", promptText: "legacy prompt", title: "Legacy" }],
    });
    expect(parsed.rows[0]?.promptTextEn).toBe("legacy prompt");
    expect(promptReorderSchema.parse({ promptIds: ["9c07e9dd-9853-4d6d-bb37-22b4b0d55884"] }).promptIds).toHaveLength(1);
    expect(promptMediaVariantQuerySchema.parse({ variant: "thumb" })).toEqual({ variant: "thumb" });
    expect(promptMediaVariantQuerySchema.parse({})).toEqual({ variant: "original" });
  });
});
