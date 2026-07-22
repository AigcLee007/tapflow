import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { PromptApiError, PromptsService, __promptsServiceTestUtils } from "../src/modules/prompts/prompts.service.js";

const context = { tenantId: "9c07e9dd-9853-4d6d-bb37-22b4b0d55884", userId: "f4bba6ab-89aa-4af7-a30e-bfb00afc5f6f" };

function poolWithQuery(query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>) {
  return { connect: async () => ({ query, release: vi.fn() }) } as never;
}

describe("PromptsService lifecycle", () => {
  const tempDirectories: string[] = [];
  afterEach(async () => { await Promise.all(tempDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true }))); });

  test("exposes bilingual fields and keeps compatibility text", () => {
    const view = __promptsServiceTestUtils.mapPrompt({
      category: "video", created_at: "", created_by: null, description: "", external_key: "video-1", id: "prompt-1", is_favorite: false, media: [], negative_prompt: null,
      prompt_text: "", prompt_text_en: "English prompt", prompt_text_zh: "中文提示词", published_at: null, sort_weight: 0, status: "draft", tags: [], tenant_id: null, title: "Video", updated_at: "", version: 1,
    });
    expect(view).toMatchObject({ promptText: "English prompt", promptTextEn: "English prompt", promptTextZh: "中文提示词" });
  });

  test("requires published prompts to be archived before deletion", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("SELECT status FROM prompt_entries") ? { rows: [{ status: "published" }] } : { rows: [] });
    const service = new PromptsService({ pool: poolWithQuery(query) });
    await expect(service.deleteAdminPrompt(context, "73f9e9b3-27af-4bf0-89c1-6f06c72dd332")).rejects.toEqual(expect.objectContaining({ code: "PROMPT_DELETE_REQUIRES_ARCHIVE" }));
    expect(query.mock.calls.some(([sql]) => String(sql).includes("DELETE FROM prompt_entries"))).toBe(false);
  });

  test("rejects incomplete reorder payload before updating any row", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("SELECT id::text AS id FROM prompt_entries") ? { rows: [{ id: "73f9e9b3-27af-4bf0-89c1-6f06c72dd332" }, { id: "d8f7b201-2a5b-449f-afec-21d47bd06af4" }] } : { rows: [] });
    const service = new PromptsService({ pool: poolWithQuery(query) });
    await expect(service.reorderAdminPrompts(context, ["73f9e9b3-27af-4bf0-89c1-6f06c72dd332"])).rejects.toBeInstanceOf(PromptApiError);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("UPDATE prompt_entries SET sort_weight"))).toBe(false);
  });

  test("falls back to original bytes when a requested derived variant is missing", async () => {
    const mediaDir = await mkdtemp(join(tmpdir(), "prompt-media-")); tempDirectories.push(mediaDir);
    await writeFile(join(mediaDir, "original.jpg"), Buffer.from("original"));
    const query = vi.fn(async (sql: string) => sql.includes("FROM prompt_entry_media media")
      ? { rows: [{ mime_type: "image/jpeg", preview_storage_key: null, storage_key: "original.jpg", thumbnail_storage_key: null, version: 4 }] }
      : { rows: [] });
    const service = new PromptsService({ pool: poolWithQuery(query), promptCatalogMediaDir: mediaDir });

    const result = await service.getLocalMediaBytes(context, "d8f7b201-2a5b-449f-afec-21d47bd06af4", undefined, "preview");
    expect(result).toMatchObject({ etag: `\"d8f7b201-2a5b-449f-afec-21d47bd06af4-preview-4\"`, mimeType: "image/jpeg" });
    expect(result.body.toString()).toBe("original");
    expect(query.mock.calls.some(([sql]) => String(sql).includes("prompt.status = 'published'"))).toBe(true);
  });
});
