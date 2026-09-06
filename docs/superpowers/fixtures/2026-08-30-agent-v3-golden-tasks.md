# Agent V3 Golden Task Matrix

The fixture matrix in `apps/api/test/fixtures/agent-v3-golden-tasks.ts` is the
small deterministic acceptance contract for the Canvas Agent V3 rollout. It
covers empty-canvas creation, selected and multi-reference edits, continuation
from prior results, graph and batch execution, stale revisions, pricing and
model availability failures, partial failures, placement failures,
cancellation, replay, prompt-injection-shaped node content, retry, and undo.

Each fixture defines only structured expectations: ordered plan action IDs,
approval policy, optional target node kinds, and terminal delivery kind. The
scorer in `src/flowCanvas/agent/v3/agentV3GoldenTasks.ts` deliberately does not
compare free-form assistant text. It checks exact plan actions, approval,
target kinds, delivery evidence, and duplicate paid-step prevention, returning
individual booleans plus a normalized numeric score.

Run the focused matrix test with:

```bash
npx vitest run src/flowCanvas/agent/v3/agentV3GoldenTasks.test.ts --reporter=dot
```

The fixture file is data imported by the frontend-side scorer test; it is not a
Vitest test file itself.
