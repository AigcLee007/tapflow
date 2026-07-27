import { describe, expect, test } from "vitest";

import {
  buildDeviceFingerprint,
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_RESEND_COOLDOWN_SECONDS,
  EMAIL_CODE_TTL_SECONDS,
  generateNumericCode,
  generateOpaqueToken,
  hashDeviceFingerprint,
  hashIpNetwork,
  hashOpaqueToken,
  hashVerificationCode,
  maskEmail,
  TRUSTED_DEVICE_TTL_SECONDS,
} from "../src/modules/auth/auth-verification.js";

describe("auth verification primitives", () => {
  const fingerprintSecret = "test-fingerprint-secret";

  test("exports the approved verification lifetimes and limits", () => {
    expect(EMAIL_CODE_TTL_SECONDS).toBe(600);
    expect(EMAIL_CODE_MAX_ATTEMPTS).toBe(5);
    expect(EMAIL_CODE_RESEND_COOLDOWN_SECONDS).toBe(60);
    expect(TRUSTED_DEVICE_TTL_SECONDS).toBe(60 * 60 * 24 * 30);
  });

  test("generates a six-digit code", () => {
    expect(generateNumericCode()).toMatch(/^\d{6}$/);
  });

  test("generates an opaque token with at least 256 bits of entropy", () => {
    const first = generateOpaqueToken();
    const second = generateOpaqueToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(first, "base64url")).toHaveLength(32);
    expect(second).not.toBe(first);
  });

  test("binds an OTP hash to the challenge and server secret", () => {
    const original = hashVerificationCode("challenge-a", "123456", "secret-a");

    expect(original).toMatch(/^[a-f0-9]{64}$/);
    expect(original).not.toBe(
      hashVerificationCode("challenge-b", "123456", "secret-a"),
    );
    expect(original).not.toBe(
      hashVerificationCode("challenge-a", "123456", "secret-b"),
    );
  });

  test("hashes opaque tokens deterministically", () => {
    expect(hashOpaqueToken("token-a")).toBe(
      "a70bf50e531ce1a817561f2f5d5b6645d4e806becf58ccc5e8cf6b8045a090a8",
    );
    expect(hashOpaqueToken("token-a")).toBe(hashOpaqueToken("token-a"));
    expect(hashOpaqueToken("token-a")).not.toBe(hashOpaqueToken("token-b"));
  });

  test("normalizes browser and OS without browser version", () => {
    const chrome140 =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36";
    const chrome141 =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36";

    expect(buildDeviceFingerprint(chrome140)).toBe("chrome:windows:desktop");
    expect(buildDeviceFingerprint(chrome141)).toBe("chrome:windows:desktop");
    expect(hashDeviceFingerprint(chrome140, fingerprintSecret)).toBe(
      hashDeviceFingerprint(chrome141, fingerprintSecret),
    );
  });

  test("distinguishes browser, operating system, and device families", () => {
    expect(
      buildDeviceFingerprint(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1 Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("safari:ios:mobile");
    expect(
      buildDeviceFingerprint(
        "Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/142.0",
      ),
    ).toBe("firefox:linux:desktop");
    expect(buildDeviceFingerprint(null)).toBeNull();
    expect(hashDeviceFingerprint(null, fingerprintSecret)).toBeNull();
  });

  test("recognizes Chromium-token mobile browser variants in precedence order", () => {
    expect(
      buildDeviceFingerprint(
        "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36 EdgA/140.0",
      ),
    ).toBe("edge:android:mobile");
    expect(
      buildDeviceFingerprint(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1 Version/18.0 Mobile/15E148 Safari/604.1 OPiOS/4.5.0",
      ),
    ).toBe("opera:ios:mobile");
  });

  test("normalizes tablet families and rejects meaningless user agents", () => {
    expect(
      buildDeviceFingerprint(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1 Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("safari:ios:tablet");
    expect(
      buildDeviceFingerprint(
        "Mozilla/5.0 (Linux; Android 15; Tablet) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
      ),
    ).toBe("chrome:android:tablet");
    expect(buildDeviceFingerprint("not-a-user-agent")).toBeNull();
  });

  test("uses IPv4 /24 networks", () => {
    expect(hashIpNetwork("203.0.113.7", fingerprintSecret)).toBe(
      hashIpNetwork("203.0.113.220", fingerprintSecret),
    );
    expect(hashIpNetwork("203.0.114.7", fingerprintSecret)).not.toBe(
      hashIpNetwork("203.0.113.7", fingerprintSecret),
    );
  });

  test("uses IPv6 /56 networks including compressed addresses", () => {
    expect(hashIpNetwork("2001:db8:1234:5601::1", fingerprintSecret)).toBe(
      hashIpNetwork("2001:db8:1234:56ff::9", fingerprintSecret),
    );
    expect(hashIpNetwork("2001:db8:1234:5701::1", fingerprintSecret)).not.toBe(
      hashIpNetwork("2001:db8:1234:56ff::9", fingerprintSecret),
    );
  });

  test("treats IPv4-mapped IPv6 addresses as IPv4 /24 networks", () => {
    expect(hashIpNetwork("::ffff:203.0.113.7", fingerprintSecret)).toBe(
      hashIpNetwork("::ffff:203.0.113.220", fingerprintSecret),
    );
    expect(hashIpNetwork("::ffff:203.0.114.7", fingerprintSecret)).not.toBe(
      hashIpNetwork("::ffff:203.0.113.7", fingerprintSecret),
    );
  });

  test("accepts balanced IPv6 brackets and valid zones only", () => {
    expect(hashIpNetwork("[2001:db8::1]", fingerprintSecret)).toBe(
      hashIpNetwork("2001:db8::1", fingerprintSecret),
    );
    expect(hashIpNetwork("fe80::1%eth0", fingerprintSecret)).toBe(
      hashIpNetwork("fe80::2%eth0", fingerprintSecret),
    );
    expect(hashIpNetwork("[2001:db8::1", fingerprintSecret)).toBeNull();
    expect(hashIpNetwork("2001:db8::1]", fingerprintSecret)).toBeNull();
    expect(hashIpNetwork("fe80::1%", fingerprintSecret)).toBeNull();
    expect(hashIpNetwork("fe80::1%bad zone", fingerprintSecret)).toBeNull();
    expect(hashIpNetwork("fe80::1%eth0%extra", fingerprintSecret)).toBeNull();
  });

  test("keys device and network fingerprints with a server secret", () => {
    const userAgent = "Mozilla/5.0 (Windows NT 10.0) Chrome/140.0";
    expect(hashDeviceFingerprint(userAgent, "secret-a")).not.toBe(
      hashDeviceFingerprint(userAgent, "secret-b"),
    );
    expect(hashIpNetwork("203.0.113.7", "secret-a")).not.toBe(
      hashIpNetwork("203.0.113.7", "secret-b"),
    );
  });

  test("returns null for missing or invalid IP addresses", () => {
    expect(hashIpNetwork(undefined, fingerprintSecret)).toBeNull();
    expect(hashIpNetwork("not-an-ip", fingerprintSecret)).toBeNull();
  });

  test("masks an email without losing its domain", () => {
    expect(maskEmail("alice@example.com")).toBe("a***@example.com");
    expect(maskEmail("a@example.com")).toBe("a***@example.com");
  });
});
