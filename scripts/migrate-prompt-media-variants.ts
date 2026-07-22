import { createPgPool } from "@aigc-flow/db";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

type VariantRow = {
  id: string;
  preview_storage_key: string | null;
  storage_key: string;
  thumbnail_storage_key: string | null;
};

export function parsePromptMediaVariantArgs(argv: string[]) {
  const value = argv.find((item) => item.startsWith("--concurrency="))?.split("=")[1]
    ?? argv[argv.indexOf("--concurrency") + 1];
  const concurrency = value ? Number(value) : 4;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) throw new Error("--concurrency must be an integer from 1 to 16");
  return { concurrency, dryRun: argv.includes("--dry-run") };
}

export async function generatePromptMediaVariants(body: Buffer) {
  const [thumb, preview] = await Promise.all([
    sharp(body, { failOn: "none" }).rotate().resize({ fit: "inside", width: 640, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer(),
    sharp(body, { failOn: "none" }).rotate().resize({ fit: "inside", width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
  ]);
  return { preview, thumb };
}

async function exists(path: string) {
  return access(path).then(() => true).catch(() => false);
}

export async function runPromptMediaVariantMigration(argv = process.argv): Promise<void> {
  const { concurrency, dryRun } = parsePromptMediaVariantArgs(argv);
  const mediaDir = resolve(process.env.PROMPT_CATALOG_MEDIA_DIR?.trim() || "./data/prompt-catalog");
  const pool = createPgPool();
  const counts = { failed: 0, generated: 0, processed: 0, skipped: 0 };
  const adminQuery = async <T extends Record<string, unknown>>(sql: string, values: unknown[] = []) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.is_system_admin', 'true', true)");
      const result = await client.query<T>(sql, values);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  };
  try {
    const result = await adminQuery<VariantRow>(
      `SELECT id::text AS id, storage_key, thumbnail_storage_key, preview_storage_key
       FROM prompt_entry_media WHERE storage_key IS NOT NULL ORDER BY id`,
    );
    let cursor = 0;
    const worker = async () => {
      while (cursor < result.rows.length) {
        const row = result.rows[cursor++]!;
        counts.processed += 1;
        const originalPath = resolve(mediaDir, row.storage_key);
        if (!(await exists(originalPath))) { counts.skipped += 1; continue; }
        const baseKey = row.storage_key.replace(/\.[^.]+$/, "");
        const thumbKey = row.thumbnail_storage_key || `${baseKey}.thumb.webp`;
        const previewKey = row.preview_storage_key || `${baseKey}.preview.webp`;
        const needThumb = !row.thumbnail_storage_key || !(await exists(resolve(mediaDir, thumbKey)));
        const needPreview = !row.preview_storage_key || !(await exists(resolve(mediaDir, previewKey)));
        if (!needThumb && !needPreview) { counts.skipped += 1; continue; }
        try {
          if (dryRun) { counts.generated += Number(needThumb) + Number(needPreview); continue; }
          const variants = await generatePromptMediaVariants(await readFile(originalPath));
          if (needThumb) { const path = resolve(mediaDir, thumbKey); await mkdir(dirname(path), { recursive: true }); await writeFile(path, variants.thumb, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; }); }
          if (needPreview) { const path = resolve(mediaDir, previewKey); await mkdir(dirname(path), { recursive: true }); await writeFile(path, variants.preview, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; }); }
          await adminQuery(
            `UPDATE prompt_entry_media SET thumbnail_storage_key = COALESCE(thumbnail_storage_key, $2), preview_storage_key = COALESCE(preview_storage_key, $3) WHERE id = $1::uuid`,
            [row.id, thumbKey, previewKey],
          );
          counts.generated += Number(needThumb) + Number(needPreview);
        } catch (error) { counts.failed += 1; console.error(`[failed] ${row.id}`, error); }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    console.log(JSON.stringify({ ...counts, dryRun }));
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void runPromptMediaVariantMigration().catch((error) => { console.error(error); process.exitCode = 1; });
}
