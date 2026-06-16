import { ZodError, type ZodSchema } from "zod";

import { assertAgentOutputSafe } from "./agent-redaction.js";

function extractJsonCandidate(rawText: string): string {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error("Agent planner did not return valid JSON.");
  }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  if (fenced?.startsWith("{") && fenced.endsWith("}")) {
    return fenced;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error("Agent planner did not return valid JSON.");
}

export function parseAgentPlannerOutput<T>(rawText: string, schema: ZodSchema<T>): T {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJsonCandidate(rawText));
  } catch {
    throw new Error("Agent planner did not return valid JSON.");
  }

  try {
    const parsed = schema.parse(parsedJson);
    assertAgentOutputSafe(parsed);
    return parsed;
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(`Agent planner returned an invalid plan shape: ${error.issues.map((issue) => issue.message).join("; ")}`);
    }
    throw error;
  }
}
