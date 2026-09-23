-- Run the bootstrap target check as the deployment/table owner. The platform
-- function owner is intentionally a restricted NOLOGIN role and may not see
-- users in managed PostgreSQL environments with an RLS or ACL boundary.
CREATE OR REPLACE FUNCTION app.bootstrap_platform_target_user(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $function$
  SELECT id
  FROM public.users
  WHERE id = $1
    AND status = 'active'
    AND email_verified_at IS NOT NULL
  FOR UPDATE
$function$;

REVOKE ALL ON FUNCTION app.bootstrap_platform_target_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.bootstrap_platform_target_user(uuid) TO tapflow_platform_access;

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

  -- The next migration replaces the existing function while SET ROLE'd to
  -- its owner. Membership must commit before PostgreSQL permits SET ROLE.
  EXECUTE format('GRANT %I TO %I', function_owner, table_owner);
END $$;
