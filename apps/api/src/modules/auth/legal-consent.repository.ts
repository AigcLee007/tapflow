import type { PoolClient } from "pg";

import { CURRENT_LEGAL_VERSION } from "../legal/legal.documents.js";
import type { LegalConsentInput } from "./auth.schemas.js";
import { AuthApiError } from "./auth.service.js";

export type LegalConsentSource = "auth_login" | "auth_register" | "account_reconsent";

export function validateCurrentConsent(consent: LegalConsentInput): void {
  if (
    consent.termsVersion !== CURRENT_LEGAL_VERSION ||
    consent.privacyVersion !== CURRENT_LEGAL_VERSION
  ) {
    throw new AuthApiError(
      409,
      "LEGAL_CONSENT_VERSION_MISMATCH",
      "用户协议或隐私政策已更新，请重新阅读并同意后继续。",
    );
  }
}

export async function recordLegalConsent(
  client: PoolClient,
  input: { source: LegalConsentSource; userId: string; versions: LegalConsentInput },
): Promise<void> {
  await client.query(
    `
      INSERT INTO user_legal_consents (user_id, document_type, document_version, consent_source)
      VALUES
        ($1::uuid, 'terms', $2, $4),
        ($1::uuid, 'privacy', $3, $4)
      ON CONFLICT (user_id, document_type, document_version) DO NOTHING
    `,
    [input.userId, input.versions.termsVersion, input.versions.privacyVersion, input.source],
  );
}
