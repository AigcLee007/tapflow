-- Canvas Agent (tool-calling loop). New, self-contained tables; legacy agent_* tables are untouched.
-- Plan: docs/superpowers/plans/2026-09-30-canvas-agent-tool-loop-rebuild.md

CREATE TABLE IF NOT EXISTS canvas_agent_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  flow_id uuid NOT NULL,
  created_by uuid NULL,
  title text NOT NULL DEFAULT '新建对话',
  -- manual: generation waits for the user's confirmation; auto: approved automatically.
  mode text NOT NULL DEFAULT 'manual' CHECK (mode IN ('manual', 'auto')),
  -- Optional per-session text route override; NULL uses AGENT_TEXT_ROUTE_KEY.
  text_route_key text NULL,
  -- idle: ready for input; running: a loop segment is streaming; waiting: paused on pending_json.
  status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'waiting')),
  -- The single interaction the loop is paused on (questions / generation approval / canvas execution).
  pending_json jsonb NULL,
  -- Monotonic counter used to order canvas_agent_messages.seq.
  message_seq integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canvas_agent_sessions_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT canvas_agent_sessions_project_fkey FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT canvas_agent_sessions_flow_fkey FOREIGN KEY (tenant_id, project_id, flow_id)
    REFERENCES flows (tenant_id, project_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_canvas_agent_sessions_flow_owner
  ON canvas_agent_sessions (tenant_id, flow_id, created_by, updated_at DESC);

-- Full model-facing conversation, including tool calls and tool results, so a
-- paused loop can resume exactly where it stopped. Streaming deltas are not stored.
CREATE TABLE IF NOT EXISTS canvas_agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  session_id uuid NOT NULL,
  seq integer NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content text NOT NULL DEFAULT '',
  -- assistant: [{callId, name, arguments}] the model requested this round.
  tool_calls_json jsonb NULL,
  -- tool: which call this result answers.
  tool_call_id text NULL,
  tool_name text NULL,
  -- UI-only data (tool step title/duration/status, card snapshots). Never sent to the model.
  display_json jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canvas_agent_messages_session_fkey FOREIGN KEY (tenant_id, session_id)
    REFERENCES canvas_agent_sessions (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT canvas_agent_messages_seq_key UNIQUE (tenant_id, session_id, seq)
);

-- Agent-authored files (project.md, req_*.json), scoped to one canvas.
CREATE TABLE IF NOT EXISTS canvas_agent_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  flow_id uuid NOT NULL,
  path text NOT NULL CHECK (path ~ '^[A-Za-z0-9_\-][A-Za-z0-9_.\-]{0,99}$'),
  content text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  updated_by_session_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canvas_agent_files_flow_fkey FOREIGN KEY (tenant_id, project_id, flow_id)
    REFERENCES flows (tenant_id, project_id, id) ON DELETE CASCADE,
  CONSTRAINT canvas_agent_files_path_key UNIQUE (tenant_id, flow_id, path)
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['canvas_agent_sessions', 'canvas_agent_messages', 'canvas_agent_files'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', table_name || '_current_tenant', table_name);
    EXECUTE format('CREATE POLICY %I ON %I USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id())', table_name || '_current_tenant', table_name);
  END LOOP;
END $$;
