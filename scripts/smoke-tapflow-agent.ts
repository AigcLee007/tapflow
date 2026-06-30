type SmokeConfig = {
  accessToken: string;
  apiUrl: string;
  flowId?: string;
  projectId?: string;
  projectUrl?: string;
  sessionId?: string;
};

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function readOptionalEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function parseProjectIdFromUrl(projectUrl: string): string | null {
  try {
    const url = new URL(projectUrl);
    const match = url.pathname.match(/\/projects\/([^/]+)/);
    return match ? decodeURIComponent(match[1] ?? "") : null;
  } catch {
    return null;
  }
}

async function requestJson(url: string, init: RequestInit, accessToken: string) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    body = JSON.parse(text);
  }
  if (!response.ok) {
    throw new Error(typeof body === "object" && body && "message" in body ? String((body as any).message) : `HTTP ${response.status}`);
  }
  return body as Record<string, unknown>;
}

async function main() {
  const config: SmokeConfig = {
    accessToken: readRequiredEnv("TAPFLOW_ACCESS_TOKEN"),
    apiUrl: readRequiredEnv("TAPFLOW_API_URL"),
    flowId: readOptionalEnv("TAPFLOW_FLOW_ID"),
    projectId: readOptionalEnv("TAPFLOW_PROJECT_ID"),
    projectUrl: readOptionalEnv("TAPFLOW_PROJECT_URL"),
    sessionId: process.env.TAPFLOW_AGENT_SESSION_ID?.trim() || undefined,
  };

  const projectId =
    config.projectId ??
    (config.projectUrl ? parseProjectIdFromUrl(config.projectUrl) : null) ??
    (() => {
      throw new Error("Missing required env: TAPFLOW_PROJECT_ID or TAPFLOW_PROJECT_URL");
    })();

  const flowId =
    config.flowId ??
    (async () => {
      const flows = await requestJson(
        `${config.apiUrl}/api/v2/projects/${projectId}/flows`,
        { method: "GET" },
        config.accessToken,
      );
      if (!Array.isArray(flows) || flows.length === 0) {
        throw new Error(`No flows found for project ${projectId}.`);
      }
      const primaryFlow = flows.find((item) => typeof item === "object" && item && "id" in item);
      if (!primaryFlow || typeof primaryFlow !== "object" || !("id" in primaryFlow)) {
        throw new Error(`Could not resolve a flow id for project ${projectId}.`);
      }
      return String((primaryFlow as Record<string, unknown>).id);
    })();

  const createdSession = config.sessionId
    ? { id: config.sessionId }
    : await requestJson(
        `${config.apiUrl}/api/v2/agent/sessions`,
        {
          body: JSON.stringify({
            flowId: await flowId,
            projectId,
            title: "TapFlow Agent Smoke",
          }),
          method: "POST",
        },
        config.accessToken,
      );

  const sessionId = String(createdSession.id);
  const canvasOps = [
    {
      clientId: "smoke-text",
      data: { text: "TapFlow Agent smoke", title: "Smoke Text" },
      kind: "text",
      position: { x: 120, y: 120 },
      type: "add_node",
    },
  ];

  const canvasResult = await requestJson(
    `${config.apiUrl}/api/v2/agent/sessions/${sessionId}/canvas-ops`,
    {
      body: JSON.stringify({
        flowId: await flowId,
        ops: canvasOps,
        turnId: "00000000-0000-0000-0000-000000000000",
      }),
      method: "POST",
    },
    config.accessToken,
  );

  const event = canvasResult.event as Record<string, unknown> | undefined;
  if (!event || event.eventType !== "canvas_op_applied") {
    throw new Error("Smoke failed: canvas op was not applied.");
  }

  console.log(
    JSON.stringify(
      {
        applied: canvasResult.applied,
        flowId: await flowId,
        sessionId,
        projectId,
        status: "ok",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
