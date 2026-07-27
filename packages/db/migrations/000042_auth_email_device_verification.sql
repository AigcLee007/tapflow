CREATE TABLE auth_email_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (
    purpose IN ('registration', 'email_verification', 'login_device_verification')
  ),
  reason text NOT NULL CHECK (
    reason IN ('email_unverified', 'new_device', 'trust_expired', 'anomalous_login')
  ),
  challenge_token_hash text NOT NULL UNIQUE,
  code_hash text NOT NULL,
  attempts_remaining integer NOT NULL DEFAULT 5 CHECK (attempts_remaining >= 0),
  last_sent_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_email_challenges_user_id_created_at_idx
  ON auth_email_challenges (user_id, created_at DESC);

CREATE INDEX auth_email_challenges_expires_at_pending_idx
  ON auth_email_challenges (expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE auth_trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent_fingerprint_hash text,
  ip_network_hash text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  trusted_until timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_trusted_devices_user_id_trusted_until_active_idx
  ON auth_trusted_devices (user_id, trusted_until DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX auth_trusted_devices_trusted_until_active_idx
  ON auth_trusted_devices (trusted_until)
  WHERE revoked_at IS NULL;
