import type { SkillAuthoringTurnInput } from "./skill-authoring.service.js";

export function buildSkillAuthoringPrompt(input: SkillAuthoringTurnInput, repair = false): string {
  return [
    "Return JSON only with assistantReply, sourcePatch, missingQuestions, readyToPreview, validationNotes.",
    "sourcePatch may contain only creator-facing Skill fields; never emit provider, route, credential, URL, code, or executable instructions.",
    repair ? "The previous response was invalid. Repair it and return the strict JSON shape again." : "Create or refine the Skill draft.",
    `sessionId: ${input.sessionId ?? "none"}`,
    `draft: ${JSON.stringify(input.draft)}`,
    `userMessage: ${JSON.stringify(input.userMessage.trim().slice(0, 4000))}`,
    `canvasSnapshot: ${JSON.stringify(input.canvasSnapshot ?? null)}`,
  ].join("\n");
}
