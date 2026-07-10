WITH production_modes AS (
  SELECT jsonb_build_array(
    'standard',
    'panorama_360',
    'wraparound_270',
    'subject_orbit_270'
  ) AS modes
),
gpt_image_2_models AS (
  SELECT id
  FROM ai_models
  WHERE model_key = 'gpt-image-2'
),
updated_models AS (
  UPDATE ai_models AS model
  SET
    capabilities = jsonb_set(
      COALESCE(model.capabilities, '{}'::jsonb),
      '{supportedGenerationModes}',
      (
        SELECT jsonb_agg(DISTINCT value ORDER BY value)
        FROM jsonb_array_elements_text(
          COALESCE(model.capabilities->'supportedGenerationModes', '[]'::jsonb)
          || production_modes.modes
        ) AS existing(value)
      ),
      true
    ),
    updated_at = now()
  FROM production_modes
  WHERE model.id IN (SELECT id FROM gpt_image_2_models)
  RETURNING model.id
),
updated_catalog AS (
  UPDATE ai_model_catalog AS catalog
  SET
    capabilities = jsonb_set(
      COALESCE(catalog.capabilities, '{}'::jsonb),
      '{supportedGenerationModes}',
      (
        SELECT jsonb_agg(DISTINCT value ORDER BY value)
        FROM jsonb_array_elements_text(
          COALESCE(catalog.capabilities->'supportedGenerationModes', '[]'::jsonb)
          || production_modes.modes
        ) AS existing(value)
      ),
      true
    ),
    updated_at = now()
  FROM production_modes
  WHERE catalog.model_key = 'gpt-image-2'
     OR catalog.model_id IN (SELECT id FROM gpt_image_2_models)
  RETURNING catalog.id
)
UPDATE ai_routes AS route
SET
  request_config = jsonb_set(
    jsonb_set(
      COALESCE(route.request_config, '{}'::jsonb),
      '{capabilities}',
      COALESCE(route.request_config->'capabilities', '{}'::jsonb),
      true
    ),
    '{capabilities,supportedGenerationModes}',
    (
      SELECT jsonb_agg(DISTINCT value ORDER BY value)
      FROM jsonb_array_elements_text(
        COALESCE(route.request_config->'capabilities'->'supportedGenerationModes', '[]'::jsonb)
        || production_modes.modes
      ) AS existing(value)
    ),
    true
  ),
  updated_at = now()
FROM production_modes
WHERE route.modality = 'image'
  AND (
    route.model_id IN (SELECT id FROM gpt_image_2_models)
    OR route.model_family = 'gpt-image-2'
    OR route.route_key IN (
      'image.gpt-image-2',
      'image.gpt-image-2.line2',
      'image.gpt-image-2.line3',
      'image.gpt-image-2.line4'
    )
  );
