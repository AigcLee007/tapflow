type JsonRecord = Record<string, unknown>;

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
};

const optional = (name: string) => process.env[name]?.trim() || undefined;

async function requestJson(url: string, token: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) as unknown : null;
  if (!response.ok) throw new Error(`HTTP ${response.status} at ${new URL(url).pathname}`);
  return body;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

async function readEvents(url: string, token: string, taskId: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${url}/api/v2/agent/v4/tasks/${encodeURIComponent(taskId)}/events?afterSeq=0`, {
      cache: "no-store", headers: { Authorization: `Bearer ${token}` }, method: "GET", signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} at V4 event stream`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("V4 event stream has no body");
    const decoder = new TextDecoder();
    let buffer = "";
    const events: Array<{ sequence: number; type: string; status?: string }> = [];
    while (events.length < 64) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const data = frame.match(/^data:\s*(.+)$/m)?.[1];
        if (!data) continue;
        try {
          const item = record(JSON.parse(data));
          if (Number.isInteger(item.sequence) && typeof item.type === "string") {
            events.push({ sequence: item.sequence as number, type: item.type as string, ...(typeof item.status === "string" ? { status: item.status } : {}) });
          }
        } catch { /* malformed frames are ignored by the client too */ }
      }
    }
    return events;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return [];
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const apiUrl = required("TAPFLOW_API_URL").replace(/\/$/, "");
  const token = required("TAPFLOW_ACCESS_TOKEN");
  const projectId = required("TAPFLOW_PROJECT_ID");
  const flowId = required("TAPFLOW_FLOW_ID");
  const referenceAssetIds = (optional("TAPFLOW_REFERENCE_ASSET_IDS") ?? "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, 16);
  const capabilities = record(await requestJson(`${apiUrl}/api/v2/agent/capabilities`, token));
  if (capabilities.runtimeIdentity !== "v4_real") throw new Error(`V4 runtime is not active (identity=${String(capabilities.runtimeIdentity ?? "unknown")})`);
  const existingSession = optional("TAPFLOW_AGENT_V4_SESSION_ID");
  const session = existingSession ? { id: existingSession } : record(await requestJson(`${apiUrl}/api/v2/agent/sessions`, token, { body: JSON.stringify({ flowId, projectId, title: "Canvas Agent V4 staging smoke" }), method: "POST" }));
  const sessionId = typeof session.id === "string" ? session.id : "";
  if (!sessionId) throw new Error("Session creation returned no id");
  const turn = record(await requestJson(`${apiUrl}/api/v2/agent/v4/sessions/${encodeURIComponent(sessionId)}/turns`, token, {
    body: JSON.stringify({ prompt: optional("TAPFLOW_V4_PROMPT") ?? "分析这张商品实拍图并规划淘宝主图和详情页套图", referenceContext: referenceAssetIds.map((assetId) => ({ assetId })) }), method: "POST",
  }));
  const taskId = typeof turn.taskId === "string" ? turn.taskId : "";
  if (!taskId) throw new Error("V4 turn returned no taskId");
  const events = await readEvents(apiUrl, token, taskId, Number(optional("TAPFLOW_V4_STREAM_TIMEOUT_MS") ?? 20_000));
  const sequences = events.map((event) => event.sequence);
  console.log(JSON.stringify({
    commit: optional("TAPFLOW_V4_COMMIT") ?? "unknown",
    eventCount: events.length,
    events,
    flags: { agentV4Enabled: capabilities.agentV4Enabled === true, agentV4RuntimeEnabled: capabilities.agentV4RuntimeEnabled === true },
    flowId,
    projectId,
    runtimeIdentity: capabilities.runtimeIdentity,
    sequenceContiguous: sequences.every((value, index) => index === 0 || value > sequences[index - 1]),
    sessionId,
    status: "ok",
    taskId,
  }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
