UPDATE ai_routes AS route
SET
  request_config = jsonb_set(
    route.request_config,
    '{capabilities,modeConstraints,first_last_frame,minImages}',
    '1'::jsonb,
    true
  ),
  updated_at = now()
WHERE route.tenant_id IS NULL
  AND route.route_key = 'video.pixelhub.veo31-fast'
  AND route.request_config #>> '{capabilities,modeConstraints,first_last_frame,minImages}' IS DISTINCT FROM '1';
