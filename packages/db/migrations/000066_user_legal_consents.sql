-- Legal consent is associated with an Aittco account across all of its tenants.
-- It intentionally has no tenant_id.
CREATE TABLE user_legal_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('terms', 'privacy')),
  document_version text NOT NULL CHECK (length(trim(document_version)) BETWEEN 1 AND 64),
  consented_at timestamptz NOT NULL DEFAULT now(),
  consent_source text NOT NULL CHECK (
    consent_source IN ('auth_login', 'auth_register', 'account_reconsent')
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX user_legal_consents_user_document_version_uidx
  ON user_legal_consents (user_id, document_type, document_version);

CREATE INDEX user_legal_consents_user_consented_at_idx
  ON user_legal_consents (user_id, consented_at DESC);

ALTER TABLE user_legal_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_legal_consents FORCE ROW LEVEL SECURITY;

CREATE POLICY user_legal_consents_select_own
  ON user_legal_consents
  FOR SELECT
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

CREATE POLICY user_legal_consents_insert_own
  ON user_legal_consents
  FOR INSERT
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

REVOKE ALL ON user_legal_consents FROM PUBLIC;

DO $$
DECLARE
  runtime_role name := COALESCE(
    NULLIF(current_setting('app.api_database_role', true), ''),
    session_user
  );
BEGIN
  EXECUTE format(
    'GRANT SELECT, INSERT ON user_legal_consents TO %I',
    runtime_role
  );
END;
$$;
