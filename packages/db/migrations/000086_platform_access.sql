-- Platform identity is intentionally GLOBAL and user-scoped: there is no tenant_id.
-- Tenant membership, legacy system_admin and ADMIN_EMAILS are never promoted here.
-- Assignments and immutable audit events are protected by user-context RLS; only
-- fixed functions owned by a NOLOGIN role may write them. Bootstrap is an explicit
-- one-time database-owner operation, never a login side effect.
-- Deployment must use a distinct API_DATABASE_ROLE for a separate bootstrap ACL
-- boundary. If the API uses the migration/table-owner login, PostgreSQL cannot
-- distinguish it from the deployment operator; that login already owns the ACLs.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tapflow_platform_access') THEN
    CREATE ROLE tapflow_platform_access NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;

CREATE TABLE platform_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  role_key text NOT NULL CHECK (role_key IN ('platform_operator', 'platform_super_admin')),
  version integer NOT NULL CHECK (version > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 500),
  granted_by uuid REFERENCES users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid REFERENCES users(id),
  revoked_at timestamptz,
  revocation_reason text,
  CHECK ((revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
    OR (revoked_at IS NOT NULL AND length(btrim(revocation_reason)) BETWEEN 5 AND 500))
);
CREATE UNIQUE INDEX platform_role_assignments_active_user_unique
  ON platform_role_assignments(user_id) WHERE revoked_at IS NULL;
CREATE INDEX platform_role_assignments_user_version_idx ON platform_role_assignments(user_id, version DESC);
CREATE INDEX platform_role_assignments_active_role_idx ON platform_role_assignments(role_key) WHERE revoked_at IS NULL;

CREATE TABLE platform_role_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL REFERENCES users(id),
  actor_user_id uuid REFERENCES users(id),
  actor_database_role text NOT NULL,
  action text NOT NULL CHECK (action IN ('bootstrap', 'grant', 'change', 'revoke')),
  version integer NOT NULL CHECK (version > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 500),
  before_state jsonb,
  after_state jsonb NOT NULL,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(target_user_id, version)
);
CREATE INDEX platform_role_audit_created_idx ON platform_role_audit(created_at DESC, id DESC);

ALTER TABLE platform_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_role_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_roles_read_self ON platform_role_assignments FOR SELECT
  USING (user_id = app.current_user_id());
CREATE POLICY platform_roles_function_read ON platform_role_assignments FOR SELECT TO tapflow_platform_access USING (true);
CREATE POLICY platform_roles_function_insert ON platform_role_assignments FOR INSERT TO tapflow_platform_access WITH CHECK (true);
CREATE POLICY platform_roles_function_update ON platform_role_assignments FOR UPDATE TO tapflow_platform_access USING (true) WITH CHECK (true);

ALTER TABLE platform_role_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_role_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_role_audit_function_read ON platform_role_audit FOR SELECT TO tapflow_platform_access USING (true);
CREATE POLICY platform_role_audit_function_insert ON platform_role_audit FOR INSERT TO tapflow_platform_access WITH CHECK (true);
-- No UPDATE / DELETE policy: audit is append-only, including for the function owner.

CREATE FUNCTION app.platform_role_assignment_json(p_row platform_role_assignments)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, app AS $$
  SELECT jsonb_build_object(
    'id', p_row.id, 'userId', p_row.user_id, 'roleKey', p_row.role_key,
    'version', p_row.version, 'reason', p_row.reason,
    'grantedBy', p_row.granted_by, 'grantedAt', p_row.granted_at,
    'revokedBy', p_row.revoked_by, 'revokedAt', p_row.revoked_at,
    'revocationReason', p_row.revocation_reason
  )
$$;

CREATE FUNCTION app.current_platform_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
  SELECT a.role_key FROM platform_role_assignments a
  JOIN users u ON u.id = a.user_id
  WHERE a.user_id = app.current_user_id() AND a.revoked_at IS NULL AND u.status = 'active'
$$;

CREATE FUNCTION app.platform_user_role(p_user_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
BEGIN
  IF COALESCE(app.current_platform_role(), '') NOT IN ('platform_operator', 'platform_super_admin') THEN
    RAISE EXCEPTION 'PLATFORM_ACCESS_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  -- Deliberately include assignments for disabled users: an operator must not
  -- gain authority over an administrator merely because that target is disabled.
  RETURN (SELECT role_key FROM platform_role_assignments
    WHERE user_id = p_user_id AND revoked_at IS NULL);
END $$;

CREATE FUNCTION app.protect_last_platform_super_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
BEGIN
  IF OLD.status = 'active' AND (TG_OP = 'DELETE' OR NEW.status IS DISTINCT FROM 'active') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('platform-role-assignments', 0));
    IF EXISTS (SELECT 1 FROM platform_role_assignments
        WHERE user_id = OLD.id AND role_key = 'platform_super_admin' AND revoked_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM platform_role_assignments a JOIN users u ON u.id = a.user_id
        WHERE a.role_key = 'platform_super_admin' AND a.revoked_at IS NULL
          AND a.user_id <> OLD.id AND u.status = 'active') THEN
      RAISE EXCEPTION 'PLATFORM_LAST_SUPER_ADMIN';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER users_protect_last_platform_super_admin
  BEFORE UPDATE OF status OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION app.protect_last_platform_super_admin();

CREATE FUNCTION app.list_platform_role_assignments()
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
BEGIN
  IF app.current_platform_role() IS DISTINCT FROM 'platform_super_admin' THEN
    RAISE EXCEPTION 'PLATFORM_ACCESS_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  -- Return the most recent assignment, including revocations, so the next edit
  -- always has the correct optimistic version. History remains in audit.
  RETURN QUERY SELECT app.platform_role_assignment_json(latest)
    FROM platform_role_assignments latest
    WHERE NOT EXISTS (SELECT 1 FROM platform_role_assignments newer
      WHERE newer.user_id = latest.user_id AND newer.version > latest.version)
    ORDER BY latest.granted_at DESC, latest.id;
END $$;

CREATE FUNCTION app.change_platform_role(
  p_user_id uuid, p_role_key text, p_expected_version integer, p_reason text, p_request_id text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE
  v_actor uuid := app.current_user_id();
  v_previous platform_role_assignments%ROWTYPE;
  v_next platform_role_assignments%ROWTYPE;
  v_version integer;
  v_before jsonb;
BEGIN
  -- The same lock serializes all grants, revocations, bootstrap and protected
  -- user-status changes; concurrent last-super-admin removals cannot both pass.
  PERFORM pg_advisory_xact_lock(hashtextextended('platform-role-assignments', 0));
  IF app.current_platform_role() IS DISTINCT FROM 'platform_super_admin' THEN
    RAISE EXCEPTION 'PLATFORM_ACCESS_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 0
    OR (p_role_key IS NOT NULL AND p_role_key NOT IN ('platform_operator', 'platform_super_admin'))
    OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'PLATFORM_INVALID_ROLE_CHANGE';
  END IF;
  PERFORM 1 FROM users WHERE id = p_user_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND AND p_role_key IS NOT NULL THEN RAISE EXCEPTION 'PLATFORM_TARGET_INACTIVE'; END IF;
  SELECT * INTO v_previous FROM platform_role_assignments
    WHERE user_id = p_user_id AND revoked_at IS NULL FOR UPDATE;
  SELECT COALESCE(MAX(version), 0) INTO v_version FROM platform_role_audit WHERE target_user_id = p_user_id;
  IF v_version <> p_expected_version THEN RAISE EXCEPTION 'PLATFORM_ROLE_VERSION_CONFLICT'; END IF;
  IF v_previous.id IS NULL AND p_role_key IS NULL THEN RAISE EXCEPTION 'PLATFORM_ROLE_NOT_ASSIGNED'; END IF;
  IF v_previous.role_key = 'platform_super_admin' AND p_role_key IS DISTINCT FROM 'platform_super_admin'
    AND NOT EXISTS (SELECT 1 FROM platform_role_assignments a JOIN users u ON u.id = a.user_id
      WHERE a.role_key = 'platform_super_admin' AND a.revoked_at IS NULL AND a.user_id <> p_user_id AND u.status = 'active') THEN
    RAISE EXCEPTION 'PLATFORM_LAST_SUPER_ADMIN';
  END IF;
  v_version := v_version + 1;
  IF v_previous.id IS NOT NULL THEN
    v_before := app.platform_role_assignment_json(v_previous);
    UPDATE platform_role_assignments SET revoked_at = now(), revoked_by = v_actor, revocation_reason = btrim(p_reason),
      version = CASE WHEN p_role_key IS NULL THEN v_version ELSE version END
      WHERE id = v_previous.id RETURNING * INTO v_next;
  END IF;
  IF p_role_key IS NOT NULL THEN
    INSERT INTO platform_role_assignments(user_id, role_key, version, reason, granted_by)
      VALUES (p_user_id, p_role_key, v_version, btrim(p_reason), v_actor) RETURNING * INTO v_next;
  END IF;
  INSERT INTO platform_role_audit(target_user_id, actor_user_id, actor_database_role, action, version, reason, before_state, after_state, request_id)
    VALUES (p_user_id, v_actor, session_user,
      CASE WHEN p_role_key IS NULL THEN 'revoke' WHEN v_previous.id IS NULL THEN 'grant' ELSE 'change' END,
      v_version, btrim(p_reason), v_before, app.platform_role_assignment_json(v_next), p_request_id);
  UPDATE auth_sessions SET status = 'revoked', revoked_at = COALESCE(revoked_at, now())
    WHERE user_id = p_user_id AND revoked_at IS NULL;
  UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = p_user_id AND revoked_at IS NULL;
  RETURN app.platform_role_assignment_json(v_next);
END $$;

CREATE FUNCTION app.bootstrap_platform_super_admin(p_user_id uuid, p_reason text, p_confirmation text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE v_owner name; v_next platform_role_assignments%ROWTYPE;
BEGIN
  -- Check session_user as well as the ACL: broad EXECUTE grants must not turn
  -- this deployment-only function into a runtime privilege escalation path.
  SELECT pg_get_userbyid(relowner) INTO v_owner FROM pg_class WHERE oid = 'public.platform_role_assignments'::regclass;
  IF session_user <> v_owner THEN RAISE EXCEPTION 'PLATFORM_BOOTSTRAP_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF p_confirmation IS DISTINCT FROM 'BOOTSTRAP_PLATFORM_SUPER_ADMIN' THEN RAISE EXCEPTION 'PLATFORM_BOOTSTRAP_CONFIRMATION_REQUIRED'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'PLATFORM_INVALID_ROLE_CHANGE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('platform-role-assignments', 0));
  IF EXISTS (SELECT 1 FROM platform_role_assignments) OR EXISTS (SELECT 1 FROM platform_role_audit) THEN
    RAISE EXCEPTION 'PLATFORM_BOOTSTRAP_ALREADY_COMPLETED';
  END IF;
  PERFORM 1 FROM users WHERE id = p_user_id AND status = 'active' AND email_verified_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLATFORM_TARGET_INACTIVE'; END IF;
  INSERT INTO platform_role_assignments(user_id, role_key, version, reason)
    VALUES (p_user_id, 'platform_super_admin', 1, btrim(p_reason)) RETURNING * INTO v_next;
  INSERT INTO platform_role_audit(target_user_id, actor_database_role, action, version, reason, after_state)
    VALUES (p_user_id, session_user, 'bootstrap', 1, btrim(p_reason), app.platform_role_assignment_json(v_next));
  UPDATE auth_sessions SET status = 'revoked', revoked_at = COALESCE(revoked_at, now())
    WHERE user_id = p_user_id AND revoked_at IS NULL;
  UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = p_user_id AND revoked_at IS NULL;
  RETURN app.platform_role_assignment_json(v_next);
END $$;

REVOKE ALL ON platform_role_assignments, platform_role_audit FROM PUBLIC;
REVOKE ALL ON FUNCTION app.platform_role_assignment_json(platform_role_assignments) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.current_platform_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.platform_user_role(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.protect_last_platform_super_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.list_platform_role_assignments() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.change_platform_role(uuid, text, integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.bootstrap_platform_super_admin(uuid, text, text) FROM PUBLIC;

GRANT USAGE, CREATE ON SCHEMA app TO tapflow_platform_access;
GRANT USAGE ON SCHEMA public TO tapflow_platform_access;
GRANT SELECT, INSERT, UPDATE ON platform_role_assignments TO tapflow_platform_access;
GRANT SELECT, INSERT ON platform_role_audit TO tapflow_platform_access;
-- SELECT ... FOR UPDATE also requires UPDATE privilege; the owner is NOLOGIN
-- and exposes only the fixed role-assignment operations above.
GRANT SELECT, UPDATE ON users TO tapflow_platform_access;
GRANT SELECT, UPDATE ON auth_sessions, refresh_tokens TO tapflow_platform_access;
GRANT EXECUTE ON FUNCTION app.current_user_id() TO tapflow_platform_access;

DO $$
DECLARE runtime_role name := COALESCE(NULLIF(current_setting('app.api_database_role', true), ''), session_user);
BEGIN
  IF runtime_role = 'tapflow_platform_access' THEN RAISE EXCEPTION 'API_DATABASE_ROLE cannot be the platform function owner'; END IF;
  EXECUTE format('GRANT tapflow_platform_access TO %I', current_user);
  EXECUTE format('GRANT SELECT ON platform_role_assignments TO %I', runtime_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION app.current_platform_role() TO %I', runtime_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION app.platform_user_role(uuid) TO %I', runtime_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION app.list_platform_role_assignments() TO %I', runtime_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION app.change_platform_role(uuid, text, integer, text, text) TO %I', runtime_role);
  ALTER FUNCTION app.platform_role_assignment_json(platform_role_assignments) OWNER TO tapflow_platform_access;
  ALTER FUNCTION app.current_platform_role() OWNER TO tapflow_platform_access;
  ALTER FUNCTION app.platform_user_role(uuid) OWNER TO tapflow_platform_access;
  ALTER FUNCTION app.protect_last_platform_super_admin() OWNER TO tapflow_platform_access;
  ALTER FUNCTION app.list_platform_role_assignments() OWNER TO tapflow_platform_access;
  ALTER FUNCTION app.change_platform_role(uuid, text, integer, text, text) OWNER TO tapflow_platform_access;
  ALTER FUNCTION app.bootstrap_platform_super_admin(uuid, text, text) OWNER TO tapflow_platform_access;
  -- Ownership changes replace the function ACL; grant bootstrap only afterward.
  EXECUTE format('GRANT EXECUTE ON FUNCTION app.bootstrap_platform_super_admin(uuid, text, text) TO %I', current_user);
  EXECUTE format('REVOKE tapflow_platform_access FROM %I', current_user);
END $$;
REVOKE CREATE ON SCHEMA app FROM tapflow_platform_access;
