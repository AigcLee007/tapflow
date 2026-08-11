UPDATE ai_routes AS route
SET
  request_config = jsonb_set(
    jsonb_set(
      route.request_config,
      '{capabilities,resolutions}',
      '["2K"]'::jsonb,
      true
    ),
    '{capabilities,defaults,resolution}',
    '"2K"'::jsonb,
    true
  ),
  updated_at = now()
WHERE route.tenant_id IS NULL
  AND route.route_key = 'video.pixellelabs.h3video-2k';
