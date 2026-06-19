import { downloadImage } from "./imageUtils";

export function getAssetIdFromResultId(resultId: unknown): string {
  const value = typeof resultId === "string" ? resultId.trim() : "";
  return value.startsWith("asset:") ? value.slice("asset:".length).trim() : "";
}

export function getAssetIdFromAssetUrl(url: unknown): string {
  const value = typeof url === "string" ? url.trim() : "";
  if (!value) return "";

  try {
    const parsed = new URL(value, typeof window === "undefined" ? "http://localhost" : window.location.href);
    const bytesMatch = parsed.pathname.match(/\/api\/v2\/assets\/([^/]+)\/bytes(?:\/|$)/);
    if (bytesMatch?.[1]) return decodeURIComponent(bytesMatch[1]);

    const objectMatch = parsed.pathname.match(/\/assets\/([^/]+)\//);
    if (objectMatch?.[1]) return decodeURIComponent(objectMatch[1]);
  } catch {
    const clean = value.split(/[?#]/)[0] || "";
    const bytesMatch = clean.match(/\/api\/v2\/assets\/([^/]+)\/bytes(?:\/|$)/);
    if (bytesMatch?.[1]) return decodeURIComponent(bytesMatch[1]);

    const objectMatch = clean.match(/\/assets\/([^/]+)\//);
    if (objectMatch?.[1]) return decodeURIComponent(objectMatch[1]);
  }

  return "";
}

export function getPreferredImageDownloadAssetId(input: {
  nodeAssetId?: string | null;
  fallbackUrl?: string | null;
  resultAssetId?: string | null;
  resultId?: unknown;
  runtimeAssetId?: string | null;
}): string {
  return (
    getAssetIdFromResultId(input.resultId) ||
    String(input.resultAssetId || "").trim() ||
    String(input.runtimeAssetId || "").trim() ||
    String(input.nodeAssetId || "").trim() ||
    getAssetIdFromAssetUrl(input.fallbackUrl)
  );
}

export function getImageExtensionFromMimeType(mimeType: unknown): string {
  const value = typeof mimeType === "string" ? mimeType.toLowerCase() : "";
  if (value.includes("jpeg") || value.includes("jpg")) return "jpg";
  if (value.includes("png")) return "png";
  if (value.includes("webp")) return "webp";
  if (value.includes("gif")) return "gif";
  return "png";
}

export function getImageExtensionFromUrl(url: unknown, fallbackMimeType?: unknown): string {
  const value = typeof url === "string" ? url.trim() : "";
  try {
    const parsed = new URL(value, window.location.href);
    const pathname = parsed.pathname.toLowerCase();
    const match = pathname.match(/\.([a-z0-9]{2,5})$/);
    if (match?.[1]) return match[1] === "jpeg" ? "jpg" : match[1];
  } catch {
    const clean = value.split(/[?#]/)[0]?.toLowerCase() || "";
    const match = clean.match(/\.([a-z0-9]{2,5})$/);
    if (match?.[1]) return match[1] === "jpeg" ? "jpg" : match[1];
  }
  return getImageExtensionFromMimeType(fallbackMimeType);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatAittcoDownloadDate(date = new Date()): string {
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join("");
}

function sanitizePromptFilenamePart(prompt: unknown): string {
  const value = typeof prompt === "string" ? prompt : "";
  return value
    .replace(/[@#][^\s，。,.!?！？、；;：:（）()【】\[\]{}<>《》]+/g, "")
    .replace(/[\\/:*?"<>|，。,.!?！？、；;：:（）()【】\[\]{}《》]/g, "")
    .replace(/\s+/g, "")
    .trim()
    .slice(0, 12);
}

export function buildAittcoImageDownloadFilename(input: {
  date?: Date;
  extension: string;
  prompt?: string | null;
  sequence?: number | null;
}): string {
  const extension = String(input.extension || "png").replace(/^\.+/, "") || "png";
  const promptPart = sanitizePromptFilenamePart(input.prompt) || "作品";
  const brand = promptPart === "作品" ? "Aittco" : "AIttco";
  const sequence = Math.max(1, Math.floor(Number(input.sequence || 1)));
  return `${brand}_${formatAittcoDownloadDate(input.date)}_${promptPart}_${pad2(sequence)}.${extension}`;
}

export async function resolveOriginalImageDownloadUrl(input: {
  assetId?: string | null;
  fallbackUrl: string;
}): Promise<string> {
  const assetId = String(input.assetId || "").trim() || getAssetIdFromAssetUrl(input.fallbackUrl);
  if (!assetId) return input.fallbackUrl;
  return `/api/v2/assets/${encodeURIComponent(assetId)}/bytes`;
}

export async function downloadOriginalImage(input: {
  assetId?: string | null;
  fallbackUrl: string;
  filenameBase?: string;
  mimeType?: string | null;
  prompt?: string | null;
  sequence?: number | null;
}): Promise<void> {
  const url = await resolveOriginalImageDownloadUrl({
    assetId: input.assetId,
    fallbackUrl: input.fallbackUrl,
  });
  const extension = getImageExtensionFromUrl(url, input.mimeType);
  const filename = input.filenameBase
    ? `${input.filenameBase}.${extension}`
    : buildAittcoImageDownloadFilename({
        extension,
        prompt: input.prompt,
        sequence: input.sequence,
      });
  await downloadImage(url, filename);
}
