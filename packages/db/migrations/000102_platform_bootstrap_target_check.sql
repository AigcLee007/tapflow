-- Replace the bootstrap target check while executing as the existing function
-- owner. The helper itself remains owned by the deployment/table owner.
DO $$
DECLARE
  table_owner name;
  function_owner name;
BEGIN
  SELECT pg_get_userbyid(relowner) INTO table_owner
  FROM pg_class WHERE oid = 'public.platform_role_assignments'::regclass;

  SELECT pg_get_userbyid(proowner) INTO function_owner
  FROM pg_proc
  WHERE oid = 'app.bootstrap_platform_super_admin(uuid, text, text)'::regprocedure;

  IF session_user <> table_owner THEN
    RAISE EXCEPTION 'PLATFORM_BOOTSTRAP_MIGRATION_REQUIRES_TABLE_OWNER';
  END IF;
  IF function_owner <> 'tapflow_platform_access' THEN
    RAISE EXCEPTION 'PLATFORM_BOOTSTRAP_FUNCTION_OWNER_MISMATCH';
  END IF;

  GRANT CREATE ON SCHEMA app TO tapflow_platform_access;
  EXECUTE format('SET LOCAL ROLE %I', function_owner);

  CREATE OR REPLACE FUNCTION app.bootstrap_platform_super_admin(p_user_id uuid, p_reason text, p_confirmation text)
  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $function$
  DECLARE v_owner name; v_next platform_role_assignments%ROWTYPE;
  BEGIN
    SELECT pg_get_userbyid(relowner) INTO v_owner FROM pg_class WHERE oid = 'public.platform_role_assignments'::regclass;
    IF session_user <> v_owner THEN RAISE EXCEPTION 'PLATFORM_BOOTSTRAP_FORBIDDEN' USING ERRCODE = '42501'; END IF;
    IF p_confirmation IS DISTINCT FROM 'BOOTSTRAP_PLATFORM_SUPER_ADMIN' THEN RAISE EXCEPTION 'PLATFORM_BOOTSTRAP_CONFIRMATION_REQUIRED'; END IF;
    IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'PLATFORM_INVALID_ROLE_CHANGE'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('platform-role-assignments', 0));
    IF EXISTS (SELECT 1 FROM platform_role_assignments) OR EXISTS (SELECT 1 FROM platform_role_audit) THEN
      RAISE EXCEPTION 'PLATFORM_BOOTSTRAP_ALREADY_COMPLETED';
    END IF;
    PERFORM app.bootstrap_platform_target_user(p_user_id);
    IF NOT FOUND THEN RAISE EXCEPTION 'PLATFORM_TARGET_INACTIVE'; END IF;
    INSERT INTO platform_role_assignments(user_id, role_key, version, reason)
      VALUES (p_user_id, 'platform_super_admin', 1, btrim(p_reason)) RETURNING * INTO v_next;
    INSERT INTO platform_role_audit(target_user_id, actor_database_role, action, version, reason, after_state)
      VALUES (p_user_id, session_user, 'bootstrap', 1, btrim(p_reason), app.platform_role_assignment_json(v_next));
    UPDATE auth_sessions SET status = 'revoked', revoked_at = COALESCE(revoked_at, now())
      WHERE user_id = p_user_id AND revoked_at IS NULL;
    UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = p_user_id AND revoked_at IS NULL;
    RETURN app.platform_role_assignment_json(v_next);
  END
  $function$;

  RESET ROLE;
  REVOKE CREATE ON SCHEMA app FROM tapflow_platform_access;
END $$;
