export type WorkerLogFields = Record<string, unknown>;

export type WorkerLogger = {
  error: (fields: WorkerLogFields, message: string) => void;
  info: (fields: WorkerLogFields, message: string) => void;
};

export function getWorkerErrorFields(error: unknown): WorkerLogFields {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const optionalString = (key: string) =>
    typeof record[key] === "string" && record[key] ? record[key] : undefined;

  const code = optionalString("code");
  const constraint = optionalString("constraint");
  const detail = optionalString("detail");
  const table = optionalString("table");

  return {
    err: error instanceof Error ? error.message : String(error),
    ...(code ? { errorCode: code } : {}),
    ...(constraint ? { constraint } : {}),
    ...(detail ? { detail } : {}),
    ...(table ? { table } : {}),
  };
}

function writeLog(level: "error" | "info", fields: WorkerLogFields, message: string): void {
  const entry = {
    jobId: fields.jobId ?? null,
    level,
    message,
    nodeRunId: fields.nodeRunId ?? null,
    queueName: fields.queueName ?? null,
    service: "aigc-flow-v2-worker",
    timestamp: new Date().toISOString(),
    tenantId: fields.tenantId ?? null,
    traceId: fields.traceId ?? null,
    workflowRunId: fields.workflowRunId ?? null,
    ...fields,
  };

  const serialized = JSON.stringify(entry);
  if (level === "error") {
    console.error(serialized);
    return;
  }

  console.log(serialized);
}

export function createConsoleWorkerLogger(): WorkerLogger {
  return {
    error(fields, message) {
      writeLog("error", fields, message);
    },
    info(fields, message) {
      writeLog("info", fields, message);
    },
  };
}
