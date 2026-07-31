import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { isIP } from "node:net";

export const EMAIL_CODE_TTL_SECONDS = 600;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;
export const EMAIL_CODE_RESEND_COOLDOWN_SECONDS = 60;
export const TRUSTED_DEVICE_TTL_SECONDS = 60 * 60 * 24 * 30;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashLowEntropyFingerprint(
  domain: "device" | "ip-network",
  value: string,
  secret: string,
): string {
  if (!secret) {
    throw new Error("Fingerprint secret is required");
  }
  const derivedKey = createHmac("sha256", secret)
    .update("tapflow-auth-fingerprint-key:v1")
    .digest();
  return createHmac("sha256", derivedKey)
    .update(`tapflow-auth-${domain}:v1:${value}`)
    .digest("hex");
}

function parseIpv6Hextets(address: string): number[] | null {
  let normalized = address.toLowerCase().split("%", 1)[0] ?? "";
  if (normalized.includes(".")) {
    const lastColon = normalized.lastIndexOf(":");
    const ipv4 = normalized.slice(lastColon + 1).split(".").map(Number);
    if (
      ipv4.length !== 4 ||
      ipv4.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
    ) {
      return null;
    }
    const upper = (ipv4[0] << 8) | ipv4[1];
    const lower = (ipv4[2] << 8) | ipv4[3];
    normalized = `${normalized.slice(0, lastColon)}:${upper.toString(16)}:${lower.toString(16)}`;
  }

  const compressed = normalized.includes("::");
  const halves = normalized.split("::");
  if (halves.length > 2) {
    return null;
  }

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((!compressed && missing !== 0) || (compressed && missing < 1)) {
    return null;
  }

  const parts = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[a-f0-9]{1,4}$/.test(part))) {
    return null;
  }
  return parts.map((part) => Number.parseInt(part, 16));
}

function parseIpAddress(ipAddress: string): string | null {
  const raw = ipAddress.trim();
  const hasOpeningBracket = raw.startsWith("[");
  const hasClosingBracket = raw.endsWith("]");
  if (hasOpeningBracket !== hasClosingBracket) {
    return null;
  }

  const unwrapped = hasOpeningBracket ? raw.slice(1, -1) : raw;
  if (!unwrapped || unwrapped.includes("[") || unwrapped.includes("]")) {
    return null;
  }

  const zoneParts = unwrapped.split("%");
  if (zoneParts.length > 2) {
    return null;
  }
  const [address, zone] = zoneParts;
  if (!address || (zone !== undefined && !/^[A-Za-z0-9_.~-]+$/.test(zone))) {
    return null;
  }
  if (hasOpeningBracket && isIP(address) !== 6) {
    return null;
  }
  if (zone !== undefined && isIP(address) !== 6) {
    return null;
  }
  return address;
}

function normalizeIpv4Network(parts: number[]): string {
  return `ipv4:${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

function normalizeIpNetwork(ipAddress: string): string | null {
  const address = parseIpAddress(ipAddress);
  if (!address) {
    return null;
  }
  const version = isIP(address);
  if (version === 4) {
    return normalizeIpv4Network(address.split(".").map(Number));
  }
  if (version !== 6) {
    return null;
  }

  const hextets = parseIpv6Hextets(address);
  if (!hextets) {
    return null;
  }
  if (
    hextets.slice(0, 5).every((hextet) => hextet === 0) &&
    hextets[5] === 0xffff
  ) {
    return normalizeIpv4Network([
      hextets[6] >> 8,
      hextets[6] & 0xff,
      hextets[7] >> 8,
      hextets[7] & 0xff,
    ]);
  }
  const value = hextets.reduce(
    (current, hextet) => (current << 16n) | BigInt(hextet),
    0n,
  );
  const network = (value >> 72n) << 72n;
  return `ipv6:${network.toString(16).padStart(32, "0")}/56`;
}

export function generateNumericCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return sha256(token);
}

export function hashVerificationCode(
  challengeId: string,
  code: string,
  secret: string,
): string {
  if (!secret) {
    throw new Error("Verification code secret is required");
  }
  return createHmac("sha256", secret)
    .update(
      `tapflow-auth-email-code:v1:${Buffer.byteLength(challengeId)}:${challengeId}:${Buffer.byteLength(code)}:${code}`,
    )
    .digest("hex");
}

export function verificationCodeMatches(
  expectedHash: string,
  challengeId: string,
  code: string,
  secret: string,
): boolean {
  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) {
    return false;
  }
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(
    hashVerificationCode(challengeId, code, secret),
    "hex",
  );
  return timingSafeEqual(expected, actual);
}

export function maskEmail(email: string): string {
  const normalized = email.trim();
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === normalized.length - 1) {
    return "***";
  }
  return `${normalized[0]}***${normalized.slice(atIndex)}`;
}

export function buildDeviceFingerprint(userAgent?: string | null): string | null {
  const normalized = userAgent?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const browser = /(?:edg|edga|edgios|edge)\//.test(normalized)
    ? "edge"
    : /(?:opr|opios|opera)\//.test(normalized)
      ? "opera"
      : /(?:firefox|fxios)\//.test(normalized)
        ? "firefox"
        : /(?:chrome|crios)\//.test(normalized)
          ? "chrome"
          : /safari\//.test(normalized)
            ? "safari"
            : "other";
  const ipadDesktopMode = /macintosh/.test(normalized) && /mobile/.test(normalized);
  const operatingSystem = /android/.test(normalized)
    ? "android"
    : /iphone|ipad|ipod/.test(normalized) || ipadDesktopMode
      ? "ios"
      : /windows/.test(normalized)
        ? "windows"
        : /macintosh|mac os x/.test(normalized)
          ? "macos"
          : /linux/.test(normalized)
            ? "linux"
            : "other";
  const device = /ipad|tablet/.test(normalized) || ipadDesktopMode
    ? "tablet"
    : /android/.test(normalized)
      ? /mobile/.test(normalized)
        ? "mobile"
        : "tablet"
      : /mobile|iphone|ipod/.test(normalized)
      ? "mobile"
      : "desktop";

  if (browser === "other" && operatingSystem === "other") {
    return null;
  }
  return `${browser}:${operatingSystem}:${device}`;
}

export function hashDeviceFingerprint(
  userAgent: string | null | undefined,
  secret: string,
): string | null {
  const fingerprint = buildDeviceFingerprint(userAgent);
  return fingerprint
    ? hashLowEntropyFingerprint("device", fingerprint, secret)
    : null;
}

export function hashIpNetwork(
  ipAddress: string | null | undefined,
  secret: string,
): string | null {
  if (!ipAddress?.trim()) {
    return null;
  }
  const network = normalizeIpNetwork(ipAddress);
  return network
    ? hashLowEntropyFingerprint("ip-network", network, secret)
    : null;
}
