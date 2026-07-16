const SIGNED_URL_QUERY_RE = /[?&](?:x-amz-signature|x-amz-credential|signature|expires)=/i;

export function isTransientMediaUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return /^(?:blob:|data:)/i.test(trimmed) || SIGNED_URL_QUERY_RE.test(trimmed);
}

export function isFileLike(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (typeof File !== "undefined" && value instanceof File) return true;
  if (typeof Blob !== "undefined" && value instanceof Blob) return true;
  const tag = Object.prototype.toString.call(value);
  return tag === "[object File]" || tag === "[object Blob]";
}
