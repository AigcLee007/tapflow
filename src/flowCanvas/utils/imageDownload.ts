import { getAssetDownloadUrl } from "../../assets/assetApi";
import { downloadImage } from "./imageUtils";

export function getAssetIdFromResultId(resultId: unknown): string {
  const value = typeof resultId === "string" ? resultId.trim() : "";
  return value.startsWith("asset:") ? value.slice("asset:".length).trim() : "";
}

export function getPreferredImageDownloadAssetId(input: {
  nodeAssetId?: string | null;
  resultAssetId?: string | null;
  resultId?: unknown;
  runtimeAssetId?: string | null;
}): string {
  return (
    getAssetIdFromResultId(input.resultId) ||
    String(input.resultAssetId || "").trim() ||
    String(input.runtimeAssetId || "").trim() ||
    String(input.nodeAssetId || "").trim()
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

export async function resolveOriginalImageDownloadUrl(input: {
  assetId?: string | null;
  fallbackUrl: string;
}): Promise<string> {
  const assetId = String(input.assetId || "").trim();
  if (!assetId) return input.fallbackUrl;
  try {
    const download = await getAssetDownloadUrl(assetId);
    return download.url || input.fallbackUrl;
  } catch {
    return input.fallbackUrl;
  }
}

export async function downloadOriginalImage(input: {
  assetId?: string | null;
  fallbackUrl: string;
  filenameBase: string;
  mimeType?: string | null;
}): Promise<void> {
  const url = await resolveOriginalImageDownloadUrl({
    assetId: input.assetId,
    fallbackUrl: input.fallbackUrl,
  });
  const extension = getImageExtensionFromUrl(url, input.mimeType);
  await downloadImage(url, `${input.filenameBase}.${extension}`);
}
