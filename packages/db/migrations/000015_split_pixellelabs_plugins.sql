UPDATE ai_plugin_packages
SET status = 'inactive', updated_at = now()
WHERE package_key = 'pixellelabs.gemini-image';

UPDATE tenant_ai_plugin_installs AS install
SET status = 'disabled',
    disabled_at = COALESCE(disabled_at, now()),
    updated_at = now()
FROM ai_plugin_packages AS package
WHERE install.package_id = package.id
  AND package.package_key = 'pixellelabs.gemini-image'
  AND install.status <> 'disabled';

UPDATE ai_model_catalog AS catalog
SET status = 'inactive',
    updated_at = now()
FROM tenant_ai_plugin_installs AS install
JOIN ai_plugin_packages AS package
  ON package.id = install.package_id
WHERE catalog.plugin_install_id = install.id
  AND package.package_key = 'pixellelabs.gemini-image'
  AND catalog.status <> 'inactive';

UPDATE ai_routes AS route
SET status = 'inactive',
    updated_at = now()
FROM tenant_ai_plugin_installs AS install
JOIN ai_plugin_packages AS package
  ON package.id = install.package_id
WHERE route.plugin_install_id = install.id
  AND package.package_key = 'pixellelabs.gemini-image'
  AND route.status <> 'inactive';
