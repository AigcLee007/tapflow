WITH route_backfill_source AS (
  SELECT
    route.id AS route_id,
    route.tenant_id,
    route.provider_id,
    route.credential_id,
    COALESCE(
      NULLIF(route.api_mode, ''),
      NULLIF(route.request_config->>'apiMode', ''),
      NULLIF(route.request_config->>'mode', ''),
      provider.kind
    ) AS adapter_kind,
    COALESCE(
      NULLIF(route.environment, ''),
      'production'
    ) AS environment,
    COALESCE(
      NULLIF(route.base_url_override, ''),
      NULLIF(route.request_config->>'baseUrl', ''),
      provider.default_base_url
    ) AS base_url,
    ROW_NUMBER() OVER (
      PARTITION BY
        route.tenant_id,
        route.provider_id,
        route.credential_id,
        COALESCE(NULLIF(route.api_mode, ''), NULLIF(route.request_config->>'apiMode', ''), NULLIF(route.request_config->>'mode', ''), provider.kind),
        COALESCE(NULLIF(route.environment, ''), 'production'),
        COALESCE(NULLIF(route.base_url_override, ''), NULLIF(route.request_config->>'baseUrl', ''), provider.default_base_url)
      ORDER BY route.created_at ASC, route.id ASC
    ) AS ordinal_in_group
  FROM ai_routes AS route
  JOIN ai_providers AS provider
    ON provider.id = route.provider_id
  WHERE route.tenant_id IS NOT NULL
    AND route.deleted_at IS NULL
    AND route.connection_id IS NULL
),
inserted_connections AS (
  INSERT INTO ai_provider_connections (
    tenant_id,
    provider_id,
    credential_id,
    name,
    adapter_kind,
    base_url,
    environment,
    status,
    metadata,
    created_at,
    updated_at
  )
  SELECT
    tenant_id,
    provider_id,
    credential_id,
    CONCAT('Migrated Connection ', SUBSTRING(route_id::text FROM 1 FOR 8)),
    adapter_kind,
    base_url,
    environment,
    'active',
    jsonb_build_object(
      'migration', '000019_ai_route_connection_backfill',
      'sourceRouteId', route_id::text,
      'generatedFromLegacyRoute', true
    ),
    now(),
    now()
  FROM route_backfill_source
  WHERE ordinal_in_group = 1
),
matched_connections AS (
  SELECT
    source.route_id,
    connection.id AS connection_id
  FROM route_backfill_source AS source
  JOIN ai_provider_connections AS connection
    ON connection.tenant_id = source.tenant_id
   AND connection.provider_id = source.provider_id
   AND connection.environment = source.environment
   AND connection.adapter_kind = source.adapter_kind
   AND connection.credential_id IS NOT DISTINCT FROM source.credential_id
   AND connection.base_url IS NOT DISTINCT FROM source.base_url
  WHERE source.ordinal_in_group = 1
),
propagated_connections AS (
  SELECT
    source.route_id,
    anchor.connection_id
  FROM route_backfill_source AS source
  JOIN route_backfill_source AS anchor_source
    ON anchor_source.tenant_id = source.tenant_id
   AND anchor_source.provider_id = source.provider_id
   AND anchor_source.credential_id IS NOT DISTINCT FROM source.credential_id
   AND anchor_source.adapter_kind = source.adapter_kind
   AND anchor_source.environment = source.environment
   AND anchor_source.base_url IS NOT DISTINCT FROM source.base_url
   AND anchor_source.ordinal_in_group = 1
  JOIN matched_connections AS anchor
    ON anchor.route_id = anchor_source.route_id
)
UPDATE ai_routes AS route
SET
  connection_id = propagated.connection_id,
  upstream_model = COALESCE(
    NULLIF(route.upstream_model, ''),
    NULLIF(route.request_config->>'upstreamModel', ''),
    NULLIF(route.request_config->>'model', ''),
    model.model_key
  ),
  api_mode = COALESCE(
    NULLIF(route.api_mode, ''),
    NULLIF(route.request_config->>'apiMode', ''),
    NULLIF(route.request_config->>'mode', ''),
    (SELECT kind FROM ai_providers WHERE id = route.provider_id)
  ),
  request_path = COALESCE(
    NULLIF(route.request_path, ''),
    NULLIF(route.request_config->>'path', '')
  ),
  updated_at = now()
FROM propagated_connections AS propagated
LEFT JOIN ai_models AS model
  ON model.id = route.model_id
WHERE route.id = propagated.route_id;
