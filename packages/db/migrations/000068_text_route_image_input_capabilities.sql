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
UPDATE ai_models AS model
SET
  capabilities = jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(model.capabilities, '{}'::jsonb),
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
  updated_at = now()
FROM ai_providers AS provider
WHERE model.provider_id = provider.id
  AND provider.key = 'aittco-text-relay'
  AND model.model_key IN (SELECT model_key FROM verified_models);

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
    jsonb_set(
      jsonb_set(
        COALESCE(route.request_config, '{}'::jsonb),
        '{capabilities,supportsImageInput}',
        'true'::jsonb,
        true
      ),
      '{capabilities,maxImages}',
      '3'::jsonb,
      true
    ),
    '{capabilities,supportedImageMimeTypes}',
    '["image/jpeg", "image/png", "image/webp", "image/gif"]'::jsonb,
    true
  ),
  updated_at = now()
FROM ai_providers AS provider, ai_models AS model
WHERE route.provider_id = provider.id
  AND model.id = route.model_id
  AND provider.key = 'aittco-text-relay'
  AND route.route_key = 'text.' || replace(model.model_key, '.', '-')
  AND model.model_key IN (SELECT model_key FROM verified_models);

UPDATE ai_model_catalog AS catalog
SET
  capabilities = jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(catalog.capabilities, '{}'::jsonb),
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
  updated_at = now()
FROM tenant_ai_plugin_installs AS install
JOIN ai_plugin_packages AS package ON package.id = install.package_id
WHERE catalog.plugin_install_id = install.id
  AND package.package_key = 'aittco.text-relay'
  AND catalog.model_key IN (
    'gemini-3.1-pro', 'gemini-3.5-flash', 'gpt-5.6-sol', 'gpt-5.6-terra',
    'gpt-5.5', 'claude-opus-5', 'claude-sonnet-5', 'claude-opus-4-8'
  );
