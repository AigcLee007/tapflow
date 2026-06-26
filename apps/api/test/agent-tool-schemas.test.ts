import { describe, expect, it } from "vitest";

import {
  agentToolCallSchema,
  generateImageBatchToolArgsSchema,
  generateImageToolArgsSchema,
  parseAgentToolCall,
} from "../src/modules/agent/agent-tool-schemas.js";

describe("agent tool schemas", () => {
  it("accepts a valid single image generation tool call", () => {
    expect(generateImageToolArgsSchema.parse({
      id: "base_visual",
      prompt: "Create a warm ecommerce hero image",
      routeLabel: "线路一",
      size: "2K",
    })).toEqual({
      id: "base_visual",
      prompt: "Create a warm ecommerce hero image",
      routeLabel: "线路一",
      size: "2K",
    });
  });

  it("accepts a valid batch image generation tool call", () => {
    const parsed = generateImageBatchToolArgsSchema.parse({
      images: [
        { id: "cover_1", prompt: "Cover 1", referenceRefs: ["round-1-image-1"] },
        { id: "cover_2", prompt: "Cover 2" },
      ],
      sharedStyle: "same product and lighting",
    });

    expect(parsed.images).toHaveLength(2);
    expect(parsed.sharedStyle).toBe("same product and lighting");
  });

  it("rejects an empty batch and too many batch images", () => {
    expect(() => generateImageBatchToolArgsSchema.parse({ images: [] })).toThrow();
    expect(() => generateImageBatchToolArgsSchema.parse({
      images: Array.from({ length: 9 }, (_, index) => ({
        id: `image_${index}`,
        prompt: `Image ${index}`,
      })),
    })).toThrow();
  });

  it("rejects internal provider fields in tool arguments", () => {
    expect(() => parseAgentToolCall({
      arguments: {
        baseUrl: "https://provider.example",
        prompt: "Create image",
      },
      toolCallKey: "call_1",
      toolName: "generate_image",
    })).toThrow(/internal provider/i);
  });

  it("parses supported tool calls by name", () => {
    expect(parseAgentToolCall({
      arguments: { prompt: "Create image" },
      toolCallKey: "call_1",
      toolName: "generate_image",
    })).toEqual({
      arguments: { prompt: "Create image" },
      toolCallKey: "call_1",
      toolName: "generate_image",
    });

    expect(agentToolCallSchema.parse({
      arguments: { reason: "Need derived images after base result" },
      toolCallKey: "call_2",
      toolName: "continue_generation",
    }).toolName).toBe("continue_generation");
  });

  it("normalizes a single-image request that was returned in batch shape", () => {
    expect(parseAgentToolCall({
      arguments: {
        images: [
          {
            prompt: "Create a poster for a forest sports day",
            size: "1K",
          },
        ],
      },
      toolCallKey: "call_batch_fix",
      toolName: "generate_image_batch",
    })).toEqual({
      arguments: {
        prompt: "Create a poster for a forest sports day",
        size: "1K",
      },
      toolCallKey: "call_batch_fix",
      toolName: "generate_image",
    });
  });
});
