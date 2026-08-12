const REMEMBERED_EMAIL_KEY = "tapflow-auth-remembered-email-v1";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  return emailPattern.test(normalized) ? normalized : "";
}

export function getRememberedEmail(): string {
  try {
    return typeof window === "undefined" ? "" : normalizeEmail(window.localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? "");
  } catch {
    return "";
  }
}

export function setRememberedEmail(email: string): void {
  try {
    const normalized = normalizeEmail(email);
    if (typeof window === "undefined") return;
    if (normalized) window.localStorage.setItem(REMEMBERED_EMAIL_KEY, normalized);
    else window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
  } catch {}
}

export function clearRememberedEmail(): void {
  try {
    if (typeof window !== "undefined") window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
  } catch {}
}
