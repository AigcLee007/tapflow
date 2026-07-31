const RESEND_EMAIL_URL = "https://api.resend.com/emails";
const DEFAULT_TIMEOUT_MS = 10_000;
const DELIVERY_ERROR_MESSAGE = "Verification email delivery failed";

export type SendVerificationCodeInput = {
  code: string;
  email: string;
  expiresInMinutes: number;
};

export interface AuthEmailSender {
  sendVerificationCode(input: SendVerificationCodeInput): Promise<void>;
}

export class AuthEmailDeliveryError extends Error {
  constructor(message = DELIVERY_ERROR_MESSAGE) {
    super(message);
    this.name = "AuthEmailDeliveryError";
  }
}

export class ResendAuthEmailSender implements AuthEmailSender {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly timeoutMs: number;

  constructor(options: {
    apiKey: string;
    fetchImpl?: typeof fetch;
    fromEmail: string;
    fromName: string;
    timeoutMs?: number;
  }) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.fromEmail = options.fromEmail;
    this.fromName = options.fromName;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async sendVerificationCode(input: SendVerificationCodeInput): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(RESEND_EMAIL_URL, {
        body: JSON.stringify({
          from: `${this.fromName} <${this.fromEmail}>`,
          html: `<p>Your verification code is <strong>${input.code}</strong>.</p><p>It expires in ${input.expiresInMinutes} minutes.</p>`,
          subject: "Your Art-Aittco verification code",
          text: `Your verification code is ${input.code}. It expires in ${input.expiresInMinutes} minutes.`,
          to: [input.email],
        }),
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      });

      if (!response?.ok) {
        throw new AuthEmailDeliveryError();
      }
    } catch {
      throw new AuthEmailDeliveryError();
    } finally {
      clearTimeout(timeout);
    }
  }
}
