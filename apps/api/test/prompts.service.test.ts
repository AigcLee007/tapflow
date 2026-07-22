import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import sharp from "sharp";

import { PromptApiError, PromptsService, __promptsServiceTestUtils } from "../src/modules/prompts/prompts.service.js";

const context = { tenantId: "9c07e9dd-9853-4d6d-bb37-22b4b0d55884", userId: "f4bba6ab-89aa-4af7-a30e-bfb00afc5f6f" };

function poolWithQuery(query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>) {
  return { connect: async () => ({ query, release: vi.fn() }) } as never;
}

describe("PromptsService lifecycle", () => {
  const tempDirectories: string[] = [];
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })));
  });

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

  test("searches both prompt languages and only returns published prompts", async () => {
    const query = vi.fn(async (sql: string) => String(sql).includes("FROM prompt_entries p") ? { rows: [] } : { rows: [] });
    const service = new PromptsService({ pool: poolWithQuery(query) });

    await service.listPrompts(context, { limit: 24, query: "电影感", sort: "featured" });

    const listSql = query.mock.calls.map(([sql]) => String(sql)).find((sql) => sql.includes("FROM prompt_entries p"))!;
    expect(listSql).toContain("p.status = 'published'");
    expect(listSql).toContain("p.prompt_text_zh ILIKE");
    expect(listSql).toContain("p.prompt_text_en ILIKE");
  });

  test("keeps an edited published prompt published", async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("COUNT(*)::text")) return { rows: [{ count: "1" }] };
      if (sql.includes("UPDATE prompt_entries")) {
        expect(values?.[10]).toBe("published");
        return { rows: [{ id: "73f9e9b3-27af-4bf0-89c1-6f06c72dd332" }] };
      }
      if (sql.includes("FROM prompt_entries p")) return { rows: [promptRecord("published")] };
      return { rows: [] };
    });
    const service = new PromptsService({ pool: poolWithQuery(query) });

    const result = await service.updateAdminPrompt(context, "73f9e9b3-27af-4bf0-89c1-6f06c72dd332", {
      category: "portrait", description: "", externalKey: "portrait-1", negativePrompt: undefined,
      promptTextEn: "Updated English", promptTextZh: "中文提示词", sortWeight: 0, status: "published", tags: [], title: "Portrait",
    });

    expect(result.status).toBe("published");
  });

  test("takes a published prompt down to draft", async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("UPDATE prompt_entries")) {
        expect(values).toEqual(["73f9e9b3-27af-4bf0-89c1-6f06c72dd332", "draft"]);
        return { rows: [{ id: "73f9e9b3-27af-4bf0-89c1-6f06c72dd332" }] };
      }
      if (sql.includes("FROM prompt_entries p")) return { rows: [promptRecord("draft")] };
      return { rows: [] };
    });
    const service = new PromptsService({ pool: poolWithQuery(query) });

    await expect(service.setAdminStatus(context, "73f9e9b3-27af-4bf0-89c1-6f06c72dd332", "draft")).resolves.toMatchObject({ status: "draft" });
  });

  test("deletes archived prompts and cleans all local media variants", async () => {
    const mediaDir = await mkdtemp(join(tmpdir(), "prompt-media-delete-")); tempDirectories.push(mediaDir);
    await Promise.all(["original.jpg", "thumb.webp", "preview.webp"].map((name) => writeFile(join(mediaDir, name), Buffer.from(name))));
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("SELECT status FROM prompt_entries")) return { rows: [{ status: "archived" }] };
      if (sql.includes("SELECT storage_key")) return { rows: [{ preview_storage_key: "preview.webp", storage_key: "original.jpg", thumbnail_storage_key: "thumb.webp" }] };
      if (sql.includes("DELETE FROM prompt_entries")) return { rows: [] };
      return { rows: [] };
    });
    const service = new PromptsService({ pool: poolWithQuery(query), promptCatalogMediaDir: mediaDir });

    await expect(service.deleteAdminPrompt(context, "73f9e9b3-27af-4bf0-89c1-6f06c72dd332")).resolves.toEqual({ ok: true });
    await Promise.all(["original.jpg", "thumb.webp", "preview.webp"].map(async (name) => {
      await expect(access(join(mediaDir, name))).rejects.toMatchObject({ code: "ENOENT" });
    }));
  });

  test("never overwrites an existing upload variant", async () => {
    const mediaDir = await mkdtemp(join(tmpdir(), "prompt-media-upload-")); tempDirectories.push(mediaDir);
    const promptId = "73f9e9b3-27af-4bf0-89c1-6f06c72dd332";
    const mediaId = "d8f7b201-2a5b-449f-afec-21d47bd06af4";
    await mkdir(join(mediaDir, promptId), { recursive: true });
    await writeFile(join(mediaDir, promptId, `${mediaId}.thumb.webp`), Buffer.from("existing-thumb"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM prompt_entries p")) return { rows: [promptRecord("draft")] };
      if (sql.includes("COUNT(*)::text")) return { rows: [{ count: "0" }] };
      if (sql.includes("INSERT INTO prompt_entry_media")) return { rows: [{
        alt_text: "", height: 900, id: mediaId, mime_type: "image/png", original_filename: "source.png",
        preview_storage_key: null, size_bytes: "1", sort_order: 0, storage_key: `${promptId}/${mediaId}.png`,
        thumbnail_storage_key: null, width: 1200,
      }] };
      return { rows: [] };
    });
    const service = new PromptsService({ idFactory: () => mediaId, pool: poolWithQuery(query), promptCatalogMediaDir: mediaDir });
    const body = await sharp({ create: { background: "#123456", channels: 3, height: 900, width: 1200 } }).png().toBuffer();

    await service.uploadLocalMedia(context, promptId, { body, height: 900, mimeType: "image/png", originalFilename: "source.png", width: 1200 });

    expect((await readFile(join(mediaDir, promptId, `${mediaId}.thumb.webp`))).toString()).toBe("existing-thumb");
    await expect(access(join(mediaDir, promptId, `${mediaId}.preview.webp`))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

function promptRecord(status: "archived" | "draft" | "published") {
  return {
    category: "portrait", created_at: "", created_by: null, description: "", external_key: "portrait-1",
    id: "73f9e9b3-27af-4bf0-89c1-6f06c72dd332", is_favorite: false, media: [], negative_prompt: null,
    prompt_text: "English prompt", prompt_text_en: "English prompt", prompt_text_zh: "中文提示词",
    published_at: status === "published" ? "2026-07-22T00:00:00.000Z" : null, sort_weight: 0, status,
    tags: [], tenant_id: null, title: "Portrait", updated_at: "", version: 1,
  };
}
