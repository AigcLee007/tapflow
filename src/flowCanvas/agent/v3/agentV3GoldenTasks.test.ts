import { describe, expect, it } from 'vitest';
import { agentV3GoldenTasks } from '../../../../apps/api/test/fixtures/agent-v3-golden-tasks';
import { scoreAgentV3Task, type AgentV3Actual } from './agentV3GoldenTasks';

describe('agent v3 golden task matrix', () => {
  it('contains at least twenty unique, contract-valid fixtures', () => {
    expect(agentV3GoldenTasks.length).toBeGreaterThanOrEqual(20);
    expect(new Set(agentV3GoldenTasks.map((task) => task.id)).size).toBe(agentV3GoldenTasks.length);

    for (const task of agentV3GoldenTasks) {
      expect(task.id).toMatch(/^[a-z0-9-]+$/);
      expect(task.prompt.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(task.canvas.nodes)).toBe(true);
      expect(Array.isArray(task.canvas.edges)).toBe(true);
      expect(Number.isInteger(task.canvas.revision)).toBe(true);
      expect(task.expected.planActions.length).toBeGreaterThan(0);
      expect(typeof task.expected.requiresApproval).toBe('boolean');
    }
  });

  it('covers every required scenario label in the matrix', () => {
    const ids = new Set(agentV3GoldenTasks.map((task) => task.id));
    for (const id of [
      'empty-canvas-text', 'empty-canvas-image', 'empty-canvas-video', 'selected-node-edit',
      'multi-reference-edit', 'prior-result-continuation', 'graph-creation', 'batch-execution',
      'stale-revision', 'missing-pricing', 'partial-batch-failure', 'provider-success-placement-failure',
      'cancel-before-reserve', 'cancel-after-reserve', 'refresh-replay', 'prompt-injection-node-content',
      'unavailable-model', 'failed-step-retry', 'canvas-undo',
    ]) expect(ids.has(id)).toBe(true);
  });

  it('scores an exact successful plan with terminal delivery evidence', () => {
    const task = agentV3GoldenTasks.find((item) => item.id === 'empty-canvas-image')!;
    const actual: AgentV3Actual = {
      planActions: [...task.expected.planActions],
      requiresApproval: task.expected.requiresApproval,
      targetNodeKinds: [...(task.expected.targetNodeKinds ?? [])],
      terminalDelivery: { kind: 'image', assetId: 'asset-1' },
      paidStepIds: ['step-1'],
    };
    expect(scoreAgentV3Task(actual, task.expected)).toEqual({
      planActionsMatch: true, approvalPolicyMatch: true, targetKindsMatch: true,
      terminalDeliveryEvidence: true, duplicatePaidStepPrevented: true, score: 1,
    });
  });

  it('rejects free-text-only delivery and duplicate paid steps', () => {
    const task = agentV3GoldenTasks.find((item) => item.id === 'graph-creation')!;
    const actual: AgentV3Actual = {
      planActions: [...task.expected.planActions].reverse(),
      requiresApproval: !task.expected.requiresApproval,
      targetNodeKinds: [],
      terminalDelivery: { kind: 'text', text: 'done' },
      paidStepIds: ['step-1', 'step-1'],
    };
    const result = scoreAgentV3Task(actual, task.expected);
    expect(result.planActionsMatch).toBe(false);
    expect(result.approvalPolicyMatch).toBe(false);
    expect(result.terminalDeliveryEvidence).toBe(false);
    expect(result.duplicatePaidStepPrevented).toBe(false);
    expect(result.score).toBeLessThan(1);
  });

  it('treats optional delivery evidence as not applicable', () => {
    const task = agentV3GoldenTasks.find((item) => item.id === 'approval-required-batch')!;
    const result = scoreAgentV3Task({
      planActions: [...task.expected.planActions],
      requiresApproval: task.expected.requiresApproval,
      targetNodeKinds: [...(task.expected.targetNodeKinds ?? [])],
      paidStepIds: ['step-1'],
    }, task.expected);
    expect(result.terminalDeliveryEvidence).toBe(true);
    expect(result.score).toBe(1);
  });
});
