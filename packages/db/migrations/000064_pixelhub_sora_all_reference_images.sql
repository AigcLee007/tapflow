UPDATE ai_routes AS route
SET
  request_config = jsonb_set(
    route.request_config,
    '{capabilities,modeConstraints,all_reference}',
    COALESCE(route.request_config #> '{capabilities,modeConstraints,all_reference}', '{}'::jsonb) - 'requiresVideoOrAudio',
    true
  ),
  updated_at = now()
WHERE route.tenant_id IS NULL
  AND route.route_key = 'video.pixelhub.sora-v3-pro'
  AND route.request_config #>> '{capabilities,modeConstraints,all_reference,requiresVideoOrAudio}' = 'true';
