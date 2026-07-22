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

type VariantMigrationCounts = {
  failed: number;
  generated: number;
  processed: number;
  skipped: number;
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

async function writeExclusive(path: string, body: Buffer): Promise<boolean> {
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, body, { flag: "wx" });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

export async function migratePromptMediaRows(
  rows: VariantRow[],
  options: {
    concurrency: number;
    dryRun: boolean;
    mediaDir: string;
    updateRow: (id: string, thumbnailStorageKey: string, previewStorageKey: string) => Promise<void>;
  },
): Promise<VariantMigrationCounts> {
  const counts: VariantMigrationCounts = { failed: 0, generated: 0, processed: 0, skipped: 0 };
  let cursor = 0;
  const worker = async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++]!;
      counts.processed += 1;
      const originalPath = resolve(options.mediaDir, row.storage_key);
      if (!(await exists(originalPath))) { counts.skipped += 1; continue; }
      const baseKey = row.storage_key.replace(/\.[^.]+$/, "");
      const thumbKey = row.thumbnail_storage_key || `${baseKey}.thumb.webp`;
      const previewKey = row.preview_storage_key || `${baseKey}.preview.webp`;
      const thumbPath = resolve(options.mediaDir, thumbKey);
      const previewPath = resolve(options.mediaDir, previewKey);
      const writeThumb = !(await exists(thumbPath));
      const writePreview = !(await exists(previewPath));
      const updateKeys = !row.thumbnail_storage_key || !row.preview_storage_key;
      if (!writeThumb && !writePreview && !updateKeys) { counts.skipped += 1; continue; }
      try {
        if (options.dryRun) {
          counts.generated += Number(writeThumb) + Number(writePreview);
          continue;
        }
        if (writeThumb || writePreview) {
          const variants = await generatePromptMediaVariants(await readFile(originalPath));
          if (writeThumb && await writeExclusive(thumbPath, variants.thumb)) counts.generated += 1;
          if (writePreview && await writeExclusive(previewPath, variants.preview)) counts.generated += 1;
        }
        await options.updateRow(row.id, thumbKey, previewKey);
      } catch (error) {
        counts.failed += 1;
        console.error(`[failed] ${row.id}`, error);
      }
    }
  };
  await Promise.all(Array.from({ length: options.concurrency }, worker));
  return counts;
}

export async function runPromptMediaVariantMigration(argv = process.argv): Promise<void> {
  const { concurrency, dryRun } = parsePromptMediaVariantArgs(argv);
  const mediaDir = resolve(process.env.PROMPT_CATALOG_MEDIA_DIR?.trim() || "./data/prompt-catalog");
  const pool = createPgPool();
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
    const counts = await migratePromptMediaRows(result.rows, {
      concurrency,
      dryRun,
      mediaDir,
      updateRow: async (id, thumbKey, previewKey) => {
        await adminQuery(
          `UPDATE prompt_entry_media SET thumbnail_storage_key = COALESCE(thumbnail_storage_key, $2), preview_storage_key = COALESCE(preview_storage_key, $3) WHERE id = $1::uuid`,
          [id, thumbKey, previewKey],
        );
      },
    });
    console.log(JSON.stringify({ ...counts, dryRun }));
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void runPromptMediaVariantMigration().catch((error) => { console.error(error); process.exitCode = 1; });
}
