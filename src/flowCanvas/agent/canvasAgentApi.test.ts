import { describe, expect, it } from "vitest";

import { readAgentSseStream } from "./canvasAgentApi";

function createStreamResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
    status: 200,
  });
}

describe("canvasAgentApi", () => {
  it("parses plan and done events from agent SSE", async () => {
    const plans: unknown[] = [];
    const done: unknown[] = [];
    await readAgentSseStream(
      createStreamResponse([
        'event: plan\ndata: {"reply":"server plan","approvalRequired":true,"evidence":[],"plan":[],"proposedOps":[]}\n\n',
        'event: done\ndata: {"turnId":"turn-1"}\n\n',
      ]),
      {
        onDone: (data) => done.push(data),
        onPlan: (data) => plans.push(data),
      },
    );

    expect(plans).toHaveLength(1);
    expect(done).toEqual([{ turnId: "turn-1" }]);
  });
});
