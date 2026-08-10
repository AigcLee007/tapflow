WITH platform_veo_models AS (
  SELECT DISTINCT route.model_id
  FROM ai_routes AS route
  WHERE route.tenant_id IS NULL
    AND route.route_key = 'video.pixelhub.veo31-fast'
    AND route.model_id IS NOT NULL
)
UPDATE ai_models AS model
SET
  capabilities = jsonb_set(
    model.capabilities,
    '{modeConstraints,first_last_frame,minImages}',
    '1'::jsonb,
    true
  ),
  updated_at = now()
WHERE model.id IN (SELECT model_id FROM platform_veo_models)
  AND model.capabilities #>> '{modeConstraints,first_last_frame,minImages}' IS DISTINCT FROM '1';

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
