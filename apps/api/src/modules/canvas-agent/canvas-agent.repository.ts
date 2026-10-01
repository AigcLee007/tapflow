import type { Pool, PoolClient } from "pg";
import { createPgPool, withTenantTransaction } from "@aigc-flow/db";

import {
  CanvasAgentError,
  type CanvasAgentContext,
  type CanvasAgentFile,
  type CanvasAgentMessage,
  type CanvasAgentMode,
  type CanvasAgentNewMessage,
  type CanvasAgentPending,
  type CanvasAgentSession,
  type CanvasAgentSessionStatus,
} from "./canvas-agent.types.js";

export type CanvasAgentSessionPatch = Partial<{
  mode: CanvasAgentMode;
  pending: CanvasAgentPending | null;
  status: CanvasAgentSessionStatus;
  textRouteKey: string | null;
  title: string;
}>;

/** Persistence boundary. Every method is scoped to ctx.tenantId and the session owner (ctx.userId). */
export interface CanvasAgentRepository {
  assertFlowAccess(ctx: CanvasAgentContext, flowId: string): Promise<{ projectId: string }>;
  createSession(ctx: CanvasAgentContext, input: { flowId: string; mode: CanvasAgentMode; projectId: string }): Promise<CanvasAgentSession>;
  listSessions(ctx: CanvasAgentContext, flowId: string, limit: number): Promise<CanvasAgentSession[]>;
  getSession(ctx: CanvasAgentContext, sessionId: string): Promise<CanvasAgentSession>;
  updateSession(ctx: CanvasAgentContext, sessionId: string, patch: CanvasAgentSessionPatch): Promise<CanvasAgentSession>;
  /** Atomically mark the session running. Throws CANVAS_AGENT_BUSY unless idle/waiting or the previous run went stale. */
  claimRun(ctx: CanvasAgentContext, sessionId: string, staleAfterMs: number): Promise<CanvasAgentSession>;
  /** Heartbeat so a live run is not mistaken for a stale one. */
  touchRun(ctx: CanvasAgentContext, sessionId: string): Promise<void>;
  appendMessages(ctx: CanvasAgentContext, sessionId: string, messages: CanvasAgentNewMessage[]): Promise<CanvasAgentMessage[]>;
  listMessages(ctx: CanvasAgentContext, sessionId: string): Promise<CanvasAgentMessage[]>;
  listFiles(ctx: CanvasAgentContext, flowId: string): Promise<CanvasAgentFile[]>;
  readFile(ctx: CanvasAgentContext, flowId: string, path: string): Promise<CanvasAgentFile | null>;
  writeFile(ctx: CanvasAgentContext, input: { content: string; flowId: string; path: string; projectId: string; sessionId: string }): Promise<CanvasAgentFile>;
}

const SESSION_COLUMNS = `id::text, project_id::text, flow_id::text, title, mode, text_route_key, status, pending_json,
  message_seq, created_at, updated_at`;

type SessionRow = {
  created_at: Date; flow_id: string; id: string; message_seq: number; mode: CanvasAgentMode; pending_json: CanvasAgentPending | null;
  project_id: string; status: CanvasAgentSessionStatus; text_route_key: string | null; title: string; updated_at: Date;
};

function mapSession(row: SessionRow): CanvasAgentSession {
  return {
    createdAt: row.created_at.toISOString(), flowId: row.flow_id, id: row.id, messageSeq: Number(row.message_seq),
    mode: row.mode, pending: row.pending_json, projectId: row.project_id, status: row.status,
    textRouteKey: row.text_route_key, title: row.title, updatedAt: row.updated_at.toISOString(),
  };
}

type MessageRow = {
  content: string; created_at: Date; display_json: CanvasAgentMessage["display"]; id: string; role: CanvasAgentMessage["role"];
  seq: number; tool_call_id: string | null; tool_calls_json: CanvasAgentMessage["toolCalls"]; tool_name: string | null;
};

function mapMessage(row: MessageRow): CanvasAgentMessage {
  return {
    content: row.content, createdAt: row.created_at.toISOString(), display: row.display_json, id: row.id, role: row.role,
    seq: Number(row.seq), toolCallId: row.tool_call_id, toolCalls: row.tool_calls_json, toolName: row.tool_name,
  };
}

type FileRow = { content: string; path: string; updated_at: Date; version: number };
const mapFile = (row: FileRow): CanvasAgentFile => ({
  content: row.content, path: row.path, updatedAt: row.updated_at.toISOString(), version: Number(row.version),
});

const notFound = () => new CanvasAgentError(404, "CANVAS_AGENT_SESSION_NOT_FOUND", "会话不存在。");

export class PgCanvasAgentRepository implements CanvasAgentRepository {
  private readonly pool: Pool;
  constructor(options?: { pool?: Pool }) { this.pool = options?.pool ?? createPgPool(); }

  private tx<T>(ctx: CanvasAgentContext, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    return withTenantTransaction(ctx, fn, this.pool);
  }

  async assertFlowAccess(ctx: CanvasAgentContext, flowId: string): Promise<{ projectId: string }> {
    // Same ownership rule as the existing agent runtime: the caller must own the project.
    const row = await this.tx(ctx, async (client) => (await client.query<{ project_id: string }>(
      `SELECT f.project_id::text FROM flows f JOIN projects p ON p.id = f.project_id AND p.tenant_id = f.tenant_id
        WHERE f.id = $1::uuid AND f.tenant_id = $2::uuid AND p.created_by = $3::uuid
          AND f.deleted_at IS NULL AND p.deleted_at IS NULL`,
      [flowId, ctx.tenantId, ctx.userId],
    )).rows[0]);
    if (!row) throw new CanvasAgentError(404, "CANVAS_AGENT_FLOW_NOT_FOUND", "画布不存在或无权访问。");
    return { projectId: row.project_id };
  }

  async createSession(ctx: CanvasAgentContext, input: { flowId: string; mode: CanvasAgentMode; projectId: string }): Promise<CanvasAgentSession> {
    return this.tx(ctx, async (client) => mapSession((await client.query<SessionRow>(
      `INSERT INTO canvas_agent_sessions (tenant_id, project_id, flow_id, created_by, mode)
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5) RETURNING ${SESSION_COLUMNS}`,
      [ctx.tenantId, input.projectId, input.flowId, ctx.userId, input.mode],
    )).rows[0]!));
  }

  async listSessions(ctx: CanvasAgentContext, flowId: string, limit: number): Promise<CanvasAgentSession[]> {
    return this.tx(ctx, async (client) => (await client.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM canvas_agent_sessions
        WHERE tenant_id = $1::uuid AND flow_id = $2::uuid AND created_by = $3::uuid
        ORDER BY updated_at DESC LIMIT $4`,
      [ctx.tenantId, flowId, ctx.userId, limit],
    )).rows.map(mapSession));
  }

  async getSession(ctx: CanvasAgentContext, sessionId: string): Promise<CanvasAgentSession> {
    const row = await this.tx(ctx, async (client) => (await client.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM canvas_agent_sessions WHERE tenant_id = $1::uuid AND id = $2::uuid AND created_by = $3::uuid`,
      [ctx.tenantId, sessionId, ctx.userId],
    )).rows[0]);
    if (!row) throw notFound();
    return mapSession(row);
  }

  async updateSession(ctx: CanvasAgentContext, sessionId: string, patch: CanvasAgentSessionPatch): Promise<CanvasAgentSession> {
    const sets: string[] = ["updated_at = now()"];
    const values: unknown[] = [ctx.tenantId, sessionId, ctx.userId];
    const add = (column: string, value: unknown, cast = "") => { values.push(value); sets.push(`${column} = $${values.length}${cast}`); };
    if (patch.mode !== undefined) add("mode", patch.mode);
    if (patch.pending !== undefined) add("pending_json", patch.pending === null ? null : JSON.stringify(patch.pending), "::jsonb");
    if (patch.status !== undefined) add("status", patch.status);
    if (patch.textRouteKey !== undefined) add("text_route_key", patch.textRouteKey);
    if (patch.title !== undefined) add("title", patch.title);
    const row = await this.tx(ctx, async (client) => (await client.query<SessionRow>(
      `UPDATE canvas_agent_sessions SET ${sets.join(", ")}
        WHERE tenant_id = $1::uuid AND id = $2::uuid AND created_by = $3::uuid RETURNING ${SESSION_COLUMNS}`,
      values,
    )).rows[0]);
    if (!row) throw notFound();
    return mapSession(row);
  }

  async claimRun(ctx: CanvasAgentContext, sessionId: string, staleAfterMs: number): Promise<CanvasAgentSession> {
    return this.tx(ctx, async (client) => {
      const claimed = (await client.query<SessionRow>(
        `UPDATE canvas_agent_sessions SET status = 'running', updated_at = now()
          WHERE tenant_id = $1::uuid AND id = $2::uuid AND created_by = $3::uuid
            AND (status <> 'running' OR updated_at < now() - ($4::int * interval '1 millisecond'))
          RETURNING ${SESSION_COLUMNS}`,
        [ctx.tenantId, sessionId, ctx.userId, staleAfterMs],
      )).rows[0];
      if (claimed) return mapSession(claimed);
      const exists = (await client.query(
        `SELECT 1 FROM canvas_agent_sessions WHERE tenant_id = $1::uuid AND id = $2::uuid AND created_by = $3::uuid`,
        [ctx.tenantId, sessionId, ctx.userId],
      )).rowCount;
      if (!exists) throw notFound();
      throw new CanvasAgentError(409, "CANVAS_AGENT_BUSY", "Agent 正在处理上一条消息，请稍候或先停止。");
    });
  }

  async touchRun(ctx: CanvasAgentContext, sessionId: string): Promise<void> {
    await this.tx(ctx, (client) => client.query(
      `UPDATE canvas_agent_sessions SET updated_at = now()
        WHERE tenant_id = $1::uuid AND id = $2::uuid AND created_by = $3::uuid AND status = 'running'`,
      [ctx.tenantId, sessionId, ctx.userId],
    ));
  }

  async appendMessages(ctx: CanvasAgentContext, sessionId: string, messages: CanvasAgentNewMessage[]): Promise<CanvasAgentMessage[]> {
    if (!messages.length) return [];
    return this.tx(ctx, async (client) => {
      // Reserve a contiguous seq range under the session row lock.
      const reserved = (await client.query<{ message_seq: number }>(
        `UPDATE canvas_agent_sessions SET message_seq = message_seq + $4, updated_at = now()
          WHERE tenant_id = $1::uuid AND id = $2::uuid AND created_by = $3::uuid RETURNING message_seq`,
        [ctx.tenantId, sessionId, ctx.userId, messages.length],
      )).rows[0];
      if (!reserved) throw notFound();
      const firstSeq = Number(reserved.message_seq) - messages.length + 1;
      const inserted: CanvasAgentMessage[] = [];
      for (const [index, message] of messages.entries()) {
        const row = (await client.query<MessageRow>(
          `INSERT INTO canvas_agent_messages
            (tenant_id, session_id, seq, role, content, tool_calls_json, tool_call_id, tool_name, display_json)
            VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb)
            RETURNING id::text, seq, role, content, tool_calls_json, tool_call_id, tool_name, display_json, created_at`,
          [
            ctx.tenantId, sessionId, firstSeq + index, message.role, message.content,
            message.toolCalls ? JSON.stringify(message.toolCalls) : null, message.toolCallId, message.toolName,
            message.display ? JSON.stringify(message.display) : null,
          ],
        )).rows[0]!;
        inserted.push(mapMessage(row));
      }
      return inserted;
    });
  }

  async listMessages(ctx: CanvasAgentContext, sessionId: string): Promise<CanvasAgentMessage[]> {
    return this.tx(ctx, async (client) => {
      const owned = (await client.query(
        `SELECT 1 FROM canvas_agent_sessions WHERE tenant_id = $1::uuid AND id = $2::uuid AND created_by = $3::uuid`,
        [ctx.tenantId, sessionId, ctx.userId],
      )).rowCount;
      if (!owned) throw notFound();
      return (await client.query<MessageRow>(
        `SELECT id::text, seq, role, content, tool_calls_json, tool_call_id, tool_name, display_json, created_at
          FROM canvas_agent_messages WHERE tenant_id = $1::uuid AND session_id = $2::uuid ORDER BY seq`,
        [ctx.tenantId, sessionId],
      )).rows.map(mapMessage);
    });
  }

  async listFiles(ctx: CanvasAgentContext, flowId: string): Promise<CanvasAgentFile[]> {
    return this.tx(ctx, async (client) => (await client.query<FileRow>(
      `SELECT path, content, version, updated_at FROM canvas_agent_files
        WHERE tenant_id = $1::uuid AND flow_id = $2::uuid ORDER BY path`,
      [ctx.tenantId, flowId],
    )).rows.map(mapFile));
  }

  async readFile(ctx: CanvasAgentContext, flowId: string, path: string): Promise<CanvasAgentFile | null> {
    const row = await this.tx(ctx, async (client) => (await client.query<FileRow>(
      `SELECT path, content, version, updated_at FROM canvas_agent_files
        WHERE tenant_id = $1::uuid AND flow_id = $2::uuid AND path = $3`,
      [ctx.tenantId, flowId, path],
    )).rows[0]);
    return row ? mapFile(row) : null;
  }

  async writeFile(ctx: CanvasAgentContext, input: { content: string; flowId: string; path: string; projectId: string; sessionId: string }): Promise<CanvasAgentFile> {
    return this.tx(ctx, async (client) => mapFile((await client.query<FileRow>(
      `INSERT INTO canvas_agent_files (tenant_id, project_id, flow_id, path, content, updated_by_session_id)
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::uuid)
        ON CONFLICT (tenant_id, flow_id, path) DO UPDATE
          SET content = EXCLUDED.content, version = canvas_agent_files.version + 1,
              updated_by_session_id = EXCLUDED.updated_by_session_id, updated_at = now()
        RETURNING path, content, version, updated_at`,
      [ctx.tenantId, input.projectId, input.flowId, input.path, input.content, input.sessionId],
    )).rows[0]!));
  }
}
