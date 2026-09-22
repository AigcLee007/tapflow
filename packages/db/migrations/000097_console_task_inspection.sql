-- Allow the signed-in owner to inspect safe task lifecycle and request metadata.
-- Payload JSON, prompts, outputs and credentials are still excluded by the API
-- projection; this policy only makes the rows reachable under user transactions.
CREATE INDEX IF NOT EXISTS ai_call_logs_console_workflow_request_idx
  ON ai_call_logs (tenant_id, workflow_run_id, created_at DESC, id DESC)
  WHERE record_level='request' AND workflow_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_call_logs_console_node_request_idx
  ON ai_call_logs (tenant_id, node_run_id, created_at DESC, id DESC)
  WHERE record_level='request' AND node_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_call_logs_console_execution_request_idx
  ON ai_call_logs (tenant_id, execution_id, created_at DESC, id DESC)
  WHERE record_level='request' AND execution_id IS NOT NULL;

DROP POLICY IF EXISTS workflow_run_events_console_self_read ON workflow_run_events;
CREATE POLICY workflow_run_events_console_self_read ON workflow_run_events FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM workflow_runs w
    WHERE w.id=workflow_run_events.workflow_run_id
      AND w.tenant_id=workflow_run_events.tenant_id
      AND w.created_by=app.current_user_id()
      AND app.console_member(w.tenant_id)
  )
);

DROP POLICY IF EXISTS agent_task_events_console_self_read ON agent_task_events;
CREATE POLICY agent_task_events_console_self_read ON agent_task_events FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM agent_tasks a
    WHERE a.id=agent_task_events.task_id
      AND a.tenant_id=agent_task_events.tenant_id
      AND a.created_by=app.current_user_id()
      AND app.console_member(a.tenant_id)
  )
);

DROP POLICY IF EXISTS ai_call_logs_console_self_read ON ai_call_logs;
CREATE POLICY ai_call_logs_console_self_read ON ai_call_logs FOR SELECT USING (
  app.console_member(tenant_id)
  AND (
    actor_user_id=app.current_user_id()
    OR billed_user_id=app.current_user_id()
    OR EXISTS (
      SELECT 1 FROM workflow_runs w
      WHERE w.id=ai_call_logs.workflow_run_id
        AND w.tenant_id=ai_call_logs.tenant_id
        AND w.created_by=app.current_user_id()
    )
    OR EXISTS (
      SELECT 1 FROM node_runs n
      JOIN workflow_runs w ON w.id=n.workflow_run_id AND w.tenant_id=n.tenant_id
      WHERE n.id=ai_call_logs.node_run_id
        AND n.tenant_id=ai_call_logs.tenant_id
        AND w.created_by=app.current_user_id()
    )
  )
);
