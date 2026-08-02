ALTER TABLE auth_email_challenges
  DROP CONSTRAINT auth_email_challenges_purpose_check,
  ADD CONSTRAINT auth_email_challenges_purpose_check CHECK (
    purpose IN (
      'registration',
      'email_verification',
      'login_device_verification',
      'password_reset'
    )
  ),
  DROP CONSTRAINT auth_email_challenges_reason_check,
  ADD CONSTRAINT auth_email_challenges_reason_check CHECK (
    reason IN (
      'email_unverified',
      'new_device',
      'trust_expired',
      'anomalous_login',
      'password_reset'
    )
  );
