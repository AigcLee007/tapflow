-- Complete the deployment-only bootstrap ACL repair after migration 99 has
-- committed the temporary role membership.
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

  EXECUTE format('SET LOCAL ROLE %I', function_owner);
  REVOKE ALL ON FUNCTION app.bootstrap_platform_super_admin(uuid, text, text) FROM PUBLIC;
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION app.bootstrap_platform_super_admin(uuid, text, text) TO %I',
    table_owner
  );
  RESET ROLE;
  EXECUTE format('REVOKE %I FROM %I', function_owner, table_owner);
END $$;
