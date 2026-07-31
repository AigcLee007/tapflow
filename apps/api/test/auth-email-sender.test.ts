import { afterEach, describe, expect, test, vi } from "vitest";

import {
  AuthEmailDeliveryError,
  BrevoAuthEmailSender,
} from "../src/modules/auth/auth-email-sender.js";

const API_KEY = "test-brevo-api-key";
const CODE = "123456";
const EMAIL = "alice@example.com";

function createSender(fetchImpl: typeof fetch, timeoutMs?: number) {
  return new BrevoAuthEmailSender({
    apiKey: API_KEY,
    fetchImpl,
    fromEmail: "no-reply@auth.aittco.com",
    fromName: "Art-Aittco",
    timeoutMs,
  });
}

function expectSanitizedDeliveryError(error: unknown): void {
  expect(error).toBeInstanceOf(AuthEmailDeliveryError);
  expect(error).toMatchObject({ message: "Verification email delivery failed" });
  const visibleError = String(error);
  expect(visibleError).not.toContain(API_KEY);
  expect(visibleError).not.toContain(CODE);
  expect(visibleError).not.toContain(EMAIL);
}

describe("BrevoAuthEmailSender", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("sends the verification code through the Brevo transactional endpoint", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ messageId: "message-1" }), {
        headers: { "content-type": "application/json" },
        status: 201,
      }),
    );

    await createSender(fetchImpl).sendVerificationCode({
      code: CODE,
      email: EMAIL,
      expiresInMinutes: 10,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      "api-key": API_KEY,
      "content-type": "application/json",
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);

    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      sender: { email: "no-reply@auth.aittco.com", name: "Art-Aittco" },
      subject: "Your Art-Aittco verification code",
      to: [{ email: EMAIL }],
    });
    expect(body.htmlContent).toEqual(expect.stringContaining(CODE));
    expect(body.htmlContent).toEqual(expect.stringContaining("10 minutes"));
    expect(body.textContent).toEqual(expect.stringContaining(CODE));
    expect(body.textContent).toEqual(expect.stringContaining("10 minutes"));
  });

  test("aborts delivery after the default ten-second timeout", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("Request timed out", "AbortError"));
      });
    }));
    const delivery = createSender(fetchImpl).sendVerificationCode({
      code: CODE,
      email: EMAIL,
      expiresInMinutes: 10,
    }).catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetchImpl.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expectSanitizedDeliveryError(await delivery);
    expect(fetchImpl.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  test("maps non-success responses to a sanitized delivery error without logging secrets", async () => {
    const responseBody = `${API_KEY} ${CODE} ${EMAIL}`;
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(responseBody, { status: 400 }),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const error = await createSender(fetchImpl).sendVerificationCode({
      code: CODE,
      email: EMAIL,
      expiresInMinutes: 10,
    }).catch((caught: unknown) => caught);

    expectSanitizedDeliveryError(error);
    expect(String(error)).not.toContain(responseBody);
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  test("maps network failures to a sanitized delivery error", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(
      new Error(`socket failed for ${EMAIL} using ${API_KEY} and ${CODE}`),
    );

    const error = await createSender(fetchImpl).sendVerificationCode({
      code: CODE,
      email: EMAIL,
      expiresInMinutes: 10,
    }).catch((caught: unknown) => caught);

    expectSanitizedDeliveryError(error);
  });

  test("maps malformed fetch responses to a sanitized delivery error", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(null as never);

    const error = await createSender(fetchImpl).sendVerificationCode({
      code: CODE,
      email: EMAIL,
      expiresInMinutes: 10,
    }).catch((caught: unknown) => caught);

    expectSanitizedDeliveryError(error);
  });
});
