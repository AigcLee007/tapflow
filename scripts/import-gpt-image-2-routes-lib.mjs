const supportedGenerationModes = [
  "standard",
  "panorama_360",
  "wraparound_270",
  "subject_orbit_270",
];

const mouxiHubModelBySize = {
  "1K": "gpt-image-2",
  "2K": "gpt-image-2-2k",
  "4K": "gpt-image-2-4k",
};

const mouxiHubSizeTiers = {
  "1K": 1,
  "2K": 2,
  "4K": 3,
};

export function buildImportPlan() {
  return [
    {
      apiMode: "async",
      baseUrl: "https://api.mouxihub.com",
      connectionName: "GPT-Image-2 MouxiHub official",
      credentialName: "GPT-Image-2 MouxiHub official key",
      credits: 12,
      envKey: "MOUXIHUB_GPT_IMAGE_2_API_KEY",
      label: "线路一（官转，支持高质量4K）",
      requestConfig: {
        async: true,
        capabilities: { supportedGenerationModes },
        defaultSize: "1K",
        editPath: "/v1/images/edits",
        imageFieldName: "image",
        modelBySize: mouxiHubModelBySize,
        outputFormat: "png",
        path: "/v1/images/generations",
        pollPath: "/v1/images/tasks/{task_id}",
        providerBaseModel: "gpt-image-2",
        responseFormat: null,
        sizeTiers: mouxiHubSizeTiers,
        timeoutMs: 300000,
      },
      requestPath: "/v1/images/generations",
      routeKey: "image.gpt-image-2.mouxihub-official",
      upstreamModel: "gpt-image-2",
    },
    {
      apiMode: "sync",
      baseUrl: "https://api.pixellelabs.com",
      connectionName: "GPT-Image-2 PixelleLabs stable",
      credentialName: "GPT-Image-2 PixelleLabs stable key",
      credits: 3,
      envKey: "PIXELLELABS_GPT_IMAGE_2_API_KEY",
      label: "线路二（稳定，支持4K）",
      requestConfig: {
        capabilities: { supportedGenerationModes },
        editPath: "/v1/images/edits",
        outputFormat: "png",
        path: "/v1/images/generations",
        responseFormat: "b64_json",
        timeoutMs: 300000,
      },
      requestPath: "/v1/images/generations",
      routeKey: "image.gpt-image-2.pixellelabs-stable",
      upstreamModel: "gpt-image-2",
    },
  ];
}

export function parseRouteImportCommand(args) {
  if (args.includes("--help")) {
    if (args.length !== 1) throw new Error("--help cannot be combined with other arguments");
    return { apply: false, help: true, publishDefaultRouteKey: null };
  }

  const apply = args.includes("--apply");
  const publishIndex = args.indexOf("--publish");
  if (apply && publishIndex >= 0) {
    throw new Error("--apply cannot be combined with --publish");
  }
  if (apply) {
    if (args.length !== 1) throw new Error("--apply does not accept additional arguments");
    return { apply: true, help: false, publishDefaultRouteKey: null };
  }
  if (publishIndex >= 0) {
    const routeKey = args[publishIndex + 1]?.trim();
    if (!routeKey) throw new Error("--publish requires a route key to use as the default route");
    if (args.length !== 2) throw new Error("--publish accepts exactly one route key");
    return { apply: false, help: false, publishDefaultRouteKey: routeKey };
  }
  if (args.length > 0) throw new Error(`Unknown argument: ${args[0]}`);
  return { apply: false, help: false, publishDefaultRouteKey: null };
}

export function readRequiredSecrets(plan, environment = process.env) {
  return plan.map((route) => {
    const secret = environment[route.envKey]?.trim();
    if (!secret) {
      throw new Error(`${route.envKey} is required when using --apply`);
    }
    return secret;
  });
}

export function summarizePlan(plan) {
  return plan.map((route) => ({
    apiMode: route.apiMode,
    baseUrl: route.baseUrl,
    credits: route.credits,
    label: route.label,
    routeKey: route.routeKey,
  }));
}
