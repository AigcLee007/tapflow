WITH verified_models(model_key) AS (
  VALUES
    ('gemini-3.1-pro'),
    ('gemini-3.5-flash'),
    ('gpt-5.6-sol'),
    ('gpt-5.6-terra'),
    ('gpt-5.5'),
    ('claude-opus-5'),
    ('claude-sonnet-5'),
    ('claude-opus-4-8')
)
UPDATE ai_routes AS route
SET
  request_config = jsonb_set(
    COALESCE(route.request_config, '{}'::jsonb),
    '{capabilities}',
    jsonb_set(
      jsonb_set(
        jsonb_set(
          COALESCE(route.request_config->'capabilities', '{}'::jsonb),
          '{supportsImageInput}',
          'true'::jsonb,
          true
        ),
        '{maxImages}',
        '3'::jsonb,
        true
      ),
      '{supportedImageMimeTypes}',
      '["image/jpeg", "image/png", "image/webp", "image/gif"]'::jsonb,
      true
    ),
    true
  ),
  updated_at = now()
FROM ai_providers AS provider, ai_models AS model
WHERE route.provider_id = provider.id
  AND model.id = route.model_id
  AND provider.key = 'aittco-text-relay'
  AND route.route_key = 'text.' || replace(model.model_key, '.', '-')
  AND model.model_key IN (SELECT model_key FROM verified_models);
