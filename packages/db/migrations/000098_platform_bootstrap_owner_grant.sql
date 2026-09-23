-- Restore the deployment-only bootstrap ACL for databases where migration 86
-- was applied before its post-owner-change grant was corrected.
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

  -- The database owner may not be a member of the NOLOGIN function-owner
  -- role. As the migration owner, replace the function ACL with the intended
  -- owner-only bootstrap grant without granting it to PUBLIC or the API role.
  EXECUTE format(
    'ALTER FUNCTION app.bootstrap_platform_super_admin(uuid, text, text) OWNER TO %I',
    table_owner
  );
  REVOKE ALL ON FUNCTION app.bootstrap_platform_super_admin(uuid, text, text) FROM PUBLIC;
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION app.bootstrap_platform_super_admin(uuid, text, text) TO %I',
    table_owner
  );
  EXECUTE format(
    'ALTER FUNCTION app.bootstrap_platform_super_admin(uuid, text, text) OWNER TO %I',
    function_owner
  );
END $$;
